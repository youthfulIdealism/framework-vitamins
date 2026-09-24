import { v4 as uuid } from 'uuid'
import { App, computed, Ref } from 'vue'
import { generated_collection_interface, generated_document_interface, Infer_Collection_Returntype, result } from './type_generated_collection.js'
import { deep_equal } from './deep_equals.js';
import { resolve } from 'path';


type query_operation = "get" | "query";
type query_reference = generated_collection_interface<result> | generated_document_interface<result>;
type child_generator<T extends result> = (result: T) => QuerySpec | undefined;

/*
    The graph has four kinds of node:

    Query     --produces-->  Document    a query's results
    Query     --has------->  Generator   a generator function attached to a query
    Document  --+
                +--Link-->   Query       what one generator produced from one document
    Generator --+

    A Link with no document or generator is a root: a run() from outside, which keeps its query alive
    until it's unlistened. Links are also the sources that contribute generators to the query they point
    at, so a generator lives only as long as something still contributes it.

    Nothing is reference counted. After each top-level operation, _collect_garbage() marks everything
    reachable from the roots and deletes the rest, which also collects cycles.

    vitamins.query(), vitamins.document(), and generators return a QuerySpec, which describes a query but
    isn't part of the graph. Running or generating it resolves it to a Query node: a new one, or an existing
    one with the same shape.
*/

class Document {
    id: string;

    vitamins: Vitamins;
    parents: Set<Query>;
    // the links produced from this document, one per generator
    links: Map<Generator, Link>;
    reference: generated_collection_interface<result> | generated_document_interface<result>;
    document: result;

    constructor(vitamins: Vitamins, reference: generated_document_interface<result>, document: result) {
        this.vitamins = vitamins;
        this.parents = new Set();
        this.links = new Map();

        this.reference = reference;
        this.document = document;
        this.id = document._id;
    }
}

class Generator {
    parent_query: Query;
    generator_function: child_generator<result>;
    // the links contributing this generator to its query
    sources: Set<Link>;
    // the links this generator produced, one per document of its query
    links: Set<Link>;

    constructor(parent_query: Query, generator_function: child_generator<result>) {
        this.parent_query = parent_query;
        this.generator_function = generator_function;
        this.sources = new Set();
        this.links = new Set();
    }
}

class Link {
    // both unset for a root
    document?: Document;
    generator?: Generator;
    // the query this link points at
    query?: Query;
    // the generators this link contributes to its query
    contributed: Set<Generator>;
    // the _update_data pass that last refreshed this link
    pass: number;

    constructor(document?: Document, generator?: Generator) {
        this.document = document;
        this.generator = generator;
        this.contributed = new Set();
        this.pass = 0;
    }
}

// what a query fetches. Two queries with equal shapes are the same query.
class QueryShape {
    reference: query_reference;
    collection_path: string;
    operation: query_operation;
    document_id?: string;
    query_parameters?: any;

    constructor(reference: query_reference, argument?: object) {
        this.reference = reference;
        this.collection_path = this.reference.path.join('/')

        // if the reference has a query method, then it's a collection reference and we should do query operations on it
        if((reference as generated_collection_interface<result>).query) {
            this.query_parameters = argument as any;
            this.operation = 'query';
        } else if((reference as generated_document_interface<result>).get) {// if the reference has a get method, then it's a document reference and we should do get operations on it
            this.document_id = (reference as generated_document_interface<result>).document_id;
            this.operation = 'get';
        } else {
            throw new Error(`reference is not a collection reference or a query reference. Reexamine that argument.`)
        }
    }

    equals(query: QueryShape) {
        if(this === query){ return true;}
        if(query.operation !== this.operation){ return false; }
        if(query.collection_path !== this.collection_path) { return false; }
        if(query.document_id !== this.document_id) { return false; }
        if(this.query_parameters || query.query_parameters) {
            if(!this.query_parameters || !query.query_parameters) { return false; }
            if(!compare_query_parameters(query.query_parameters as Object, this.query_parameters as Object)) { return false; }
        }
        return true;
    }
}

// a description of a query and the generators to attach to it. It becomes part of the graph when it's
// run, or when a generator returns it, by resolving to a Query node.
class QuerySpec extends QueryShape {
    vitamins: Vitamins;
    // contributed to the resolved Query by the link it's resolved through
    child_generators: child_generator<result>[];

    constructor(vitamins: Vitamins, reference: query_reference, argument?: object, child_generators: child_generator<result>[] = []) {
        super(reference, argument);
        this.vitamins = vitamins;
        this.child_generators = child_generators;
    }

    async run(): Promise<{ query: Query, get_results: Query['get_results'], rerun: Query['rerun'], unlisten: () => void }> {
        let vitamins = this.vitamins;
        vitamins._debug(`running ${this.reference.collection_id}`)

        // every run is a root, which keeps the query alive until it's unlistened
        let root = new Link();
        vitamins.roots.add(root);

        // resolves to an existing query if there is one
        let { query, fetch } = vitamins._resolve_query(this, root);
        if(fetch) {
            await fetch;
        } else {
            vitamins._collect_garbage();
        }

        return {
            query,
            get_results: query.get_results.bind(query),
            rerun: query.rerun.bind(query),
            unlisten: () =>{
                vitamins.unlisten_query(root)
            }
        };
    }
}

// a query in the graph
class Query extends QueryShape {
    id: string;
    vitamins: Vitamins;
    // this query's results
    documents: Set<Document>;
    // links pointing at this query: roots, or generators run against a document
    parents: Set<Link>;
    // the generators that run against this query's documents
    generators: Map<child_generator<result>, Generator>;
    // the permanent root keeping this query alive for documents added from outside
    external_root?: Link;
    has_run: boolean;
    run_wait?: Promise<boolean>;
    #fulfill_run_wait?: (arg: boolean) => void;

    last_result?: result;

    constructor(vitamins: Vitamins, shape: QueryShape){
        super(shape.reference, shape.query_parameters);
        this.id = uuid();
        vitamins._debug(`constructing query ${this.reference.collection_id} ${this.id}`)
        this.documents = new Set();
        this.parents = new Set();
        this.vitamins = vitamins;
        this.generators = new Map();
        this.run_wait = new Promise((resolve, reject) => {
            this.#fulfill_run_wait = resolve;
        });
        this.has_run = false;
    }

    async rerun() {
        this.vitamins._debug(`RERUNNING QUERY`)
        this.has_run = false;
        this.run_wait = new Promise((resolve, reject) => {
            this.#fulfill_run_wait = resolve;
        });
        await this._fetch();
    }

    async _fetch(){
        if(this.has_run){ return; }
        this.has_run = true;
        try {
            if(this.operation === 'get'){
                let reference = this.reference as generated_document_interface<result>;
                // TODO: how do I want to handle errors? This clearly needs to be in a try-catch.
                let result = await reference.get();
                if(result){
                    this.vitamins._update_data(reference, result._id, result, this);
                }
            } else if(this.operation === 'query'){
                let reference = this.reference as generated_collection_interface<result>;
                // TODO: how do I want to handle errors? This clearly needs to be in a try-catch.
                let results = await reference.query(this.query_parameters);
                for(let result of results){
                    this.vitamins._update_data(reference, result._id, result, this, false);
                }
                // collect garbage once for the whole batch, not once per document
                this.vitamins._collect_garbage();
                if(results.length > 0){ this.last_result = results[results.length - 1]; }
            }
        } catch(err){
            return Promise.reject(err);
        } finally {this.#fulfill_run_wait!(true); }
    }

    // a spec for this query, carrying the generators currently attached to it
    clone() {
        return new QuerySpec(this.vitamins, this.reference, structuredClone(this.query_parameters), Array.from(this.generators.keys()));
    }

    async next_page() {
        if(this.operation !== 'query'){ throw new Error(`can only paginate queries`); }
        if(!this.last_result){ throw new Error(`tried to paginate before the last results were loaded.`); }
        let next_query = this.clone();
        if(!next_query.query_parameters){ next_query.query_parameters = {}; }
        next_query.query_parameters.cursor = this.last_result._id;
        return await next_query.run();
    }

    async get_results<T>() {
        await this.run_wait;
        return Array.from(this.documents).map((document: Document) => {
            return this.vitamins.vue[document.reference.collection_name_plural].get(document.id);
        }) as T[];
    }

    static find_query(queries: Query[], target: QueryShape){
        for(let query of queries){
            if(query.equals(target)) { return query; }
        }
        return undefined;
    }
}

function compare_query_parameters(a: object, b: object): boolean {
    let key_value_a = Object.entries(a);
    if(key_value_a.length !== Object.keys(b).length) { return false; }
    for(let [key, value_a] of key_value_a) {
        //@ts-expect-error
        let value_b = b[key] as any;
        if(typeof value_a !== typeof value_b) { return false; }
        if(Array.isArray(value_a)) {
            if(!Array.isArray(value_b)){ return false; }
            if(!compare_array(value_a, value_b)){ return false; }
        } else if(value_a !== value_b){
            if(typeof value_a === 'object'){ return deep_equal(value_a, value_b); }
            return false;
        }
    }

    return true;
}

function compare_array(a: any[], b: any[]){
    if(a.length !== b.length){ return false; }
    for(let q = 0; q < a.length; q++){
        if(a[q] !== b[q]){ return false;}
    }
    return true;
}

function quickprint(query: Query){
    return {
        id: query.id,
        collection: query.reference.collection_id,
        query_parameters: query.query_parameters
    }
}

export class Vitamins {
    vue: App | any;
    documents: Map<string, Document> // document id -> document
    all_queries: Map<string, Query>
    queries_by_collection: Map<string, Set<Query>>// collection id -> document[]
    debug_on: boolean;
    roots: Set<Link> // what garbage collection marks from
    _rewalking_queries: Set<Query> // queries whose documents are currently being re-walked in _resolve()
    _pass: number // incremented per _update_data, so links it didn't refresh can be told apart

    constructor(vue: App | any) {
        this.vue = vue;
        this.documents = new Map();
        this.queries_by_collection = new Map();
        this.all_queries = new Map()
        this.debug_on = false;
        this.roots = new Set();
        this._rewalking_queries = new Set();
        this._pass = 0;
    }

    document<DOC extends generated_document_interface<result>>(document: DOC, ...generators: child_generator<Infer_Collection_Returntype<DOC>>[]): QuerySpec {
        // deduping against existing queries happens when the spec is resolved, not here
        return new QuerySpec(this, document, undefined, generators as child_generator<result>[]);
    }

    query<COL extends generated_collection_interface<result>>(collection: COL, query_parameters: any, ...generators: child_generator<Infer_Collection_Returntype<COL>>[]): QuerySpec {
        return new QuerySpec(this, collection, query_parameters ?? {}, generators as child_generator<result>[]);
    }

    unlisten_query(root: Link) {
        this._remove_link(root);
        this._collect_garbage();
    }

    add_document_from_external<Document extends generated_document_interface<result>>(collection: Document, data: result) {
        let shape = new QueryShape(collection);
        this._debug(`adding document from external ${shape.reference.collection_id}`)
        let self = this._find_existing_query(shape);
        if(self) {
            this._debug(`using existing query ${self.id}`);
        } else {
            self = new Query(this, shape);
            this._add_query(self);
        }
        self.has_run = true;

        // nothing outside holds this query, so give it a permanent root
        if(!self.external_root) {
            self.external_root = new Link();
            self.external_root.query = self;
            self.parents.add(self.external_root);
            this.roots.add(self.external_root);
        }
        this._update_data(self.reference, data._id, data, self);
    }

    delete_document_from_external(document_id: string) {
        let document = this.documents.get(document_id);
        if(!document) { return; }
        for(let query of document.parents) {
            query.documents.delete(document);
        }
        document.parents.clear();
        this._collect_garbage();
    }

    update_document_from_external(document_id: string, data: result) {
        return this._update_data(undefined, document_id, data);
    }

    _debug(...print: any[]) {
        if(this.debug_on){ console.log(...print); }
    }

    _find_existing_query(query: QueryShape) {
        let collection_queries = this.queries_by_collection.get(query.reference.collection_id) ?? new Set<Query>();
        let existing_query = Query.find_query(Array.from(collection_queries), query);
        return existing_query;
    }

    _add_query(query: Query) {
        this._debug(`attaching query ${query.id}`)
        // if queries_by_collection does not yet have a key for the relevant collection, create one.
        if(!this.queries_by_collection.has(query.reference.collection_id)){
            this.queries_by_collection.set(query.reference.collection_id, new Set());
        }

        // add the query to the maps and sets
        let queries = this.queries_by_collection.get(query.reference.collection_id)!;
        queries.add(query);
        this.all_queries.set(query.id, query);
    }

    _delete_query(query: Query) {
        this.queries_by_collection.get(query.reference.collection_id)?.delete(query);
        this.all_queries.delete(query.id);
    }

    _add_document(document: Document) {
        this.documents.set(document.document._id, document);
    }

    /*
        Points a link at the query a spec describes, creating it unless an existing query has the same shape,
        and makes the link contribute the spec's generators. Returns the query, and its fetch if it's new.
    */
    _resolve_query(spec: QuerySpec, link: Link): { query: Query, fetch?: Promise<void> } {
        let self = this._find_existing_query(spec);
        let is_new = !self;
        if(!self) {
            self = new Query(this, spec);
            this._add_query(self);
        } else {
            this._debug(`resolved ${spec.reference.collection_id} to existing query ${self.id}`);
        }

        // if the link used to point at a different query, everything it contributed there goes with it
        if(link.query !== self) {
            if(link.query) {
                link.query.parents.delete(link);
                this._set_generators_contributed_by_link(link, []);
            }
            link.query = self;
            self.parents.add(link);
        }

        // re-contributing through the same link replaces what it contributed before, so regenerated closures
        // don't pile up. What the replaced generators produced is left for garbage collection, by which time
        // the new generators have re-linked anything they still produce.
        let added_generators = this._set_generators_contributed_by_link(link, spec.child_generators);

        if(is_new) {
            // fetching runs every generator against the results, so there's no rewalk to do
            return { query: self, fetch: self._fetch() };
        }

        // run the new generators against the documents this query already has, since that wouldn't otherwise
        // happen. Skip if this query is already being re-walked further up the (synchronous) call stack,
        // since reciprocal generators between collections would otherwise recurse forever; the new generators
        // still run on those documents' next update. Skipping never loses existing output: inside a rewalk,
        // every link comes from a newly-added generator, so it's new and had nothing to replace.
        if(added_generators.length > 0 && !this._rewalking_queries.has(self)) {
            this._rewalking_queries.add(self);
            try {
                for(let document of Array.from(self.documents)) {
                    for(let generator of added_generators) {
                        this._run_generator(document, generator);
                    }
                }
            } finally {
                this._rewalking_queries.delete(self);
            }
        }
        return { query: self };
    }

    /*
        Sets the generators a link contributes to the query it points at. A generator already on the query,
        from any link, is shared rather than duplicated: this is what keeps mutually-recursive generators from
        growing forever around a cycle. Generators left without any source are collected as garbage.
        Returns the generators that are new to the query.
    */
    _set_generators_contributed_by_link(link: Link, fns: child_generator<result>[]) {
        let added: Generator[] = [];

        for(let generator of Array.from(link.contributed)) {
            if(fns.includes(generator.generator_function)) { continue; }
            link.contributed.delete(generator);
            generator.sources.delete(link);
        }

        let query = link.query!;
        for(let fn of fns) {
            let generator = query.generators.get(fn);
            if(!generator) {
                generator = new Generator(query, fn);
                query.generators.set(fn, generator);
                added.push(generator);
            }
            generator.sources.add(link);
            link.contributed.add(generator);
        }

        return added;
    }

    // runs one generator against one document, creating, refreshing, or removing the link between them
    _run_generator(document: Document, generator: Generator) {
        let child_query = generator.generator_function(document.document);
        let link = document.links.get(generator);
        if(!child_query) {
            if(link) { this._remove_link(link); }
            return;
        }

        if(!link) {
            link = new Link(document, generator);
            document.links.set(generator, link);
            generator.links.add(link);
        }
        link.pass = this._pass;
        // child queries fetch in the background
        this._resolve_query(child_query, link);
    }

    _remove_link(link: Link) {
        if(link.document && link.generator) { link.document.links.delete(link.generator); }
        link.generator?.links.delete(link);
        link.query?.parents.delete(link);
        for(let generator of link.contributed) {
            generator.sources.delete(link);
        }
        link.contributed.clear();
        this.roots.delete(link);
    }

    // TODO: do I need to be accepting an array of documents so that I can link/unlink all of them?
    _update_data(reference: generated_collection_interface<result> | generated_document_interface<result> | undefined, document_id: string, data: result, query?: Query, collect_garbage: boolean = true) {
        // if this document doesn't already exist, create it.
        let document = this.documents.get(document_id);
        if(!document) {
            if(!reference){ return; }
            document = new Document(this, reference as generated_document_interface<result>, data);
            this._add_document(document);
        }

        this._debug(`updating data for a ${document.reference.collection_id} ${document_id}`);
        let pass = ++this._pass;

        // update the data for the document
        document.document = data;

        if(query){
            query.documents.add(document);
            document.parents.add(query);
        }

        // regenerate the document's links from every generator of every query it belongs to. Generators with
        // no source are waiting to be collected, so don't run them.
        for(let parent_query of Array.from(document.parents)) {
            for(let generator of Array.from(parent_query.generators.values())) {
                if(generator.sources.size === 0) { continue; }
                this._run_generator(document, generator);
            }
        }

        // any link this pass didn't refresh is stale: its generator is gone or no longer runs here
        for(let link of Array.from(document.links.values())) {
            if(link.pass !== pass) { this._remove_link(link); }
        }

        /*
            Clone the response data to prevent any funkyness if it gets changed in the frontend code,
            and then load it into Vue.
        */
        let cloned_data = structuredClone(data);

        if(!this.vue[document.reference.collection_name_plural]){
            throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app does not have a ${document.reference.collection_name_plural} key`);
        }

        if(!(this.vue[document.reference.collection_name_plural] instanceof Map)){
            throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app key ${document.reference.collection_name_plural} is not a map. It should be a Map<string, ${document.reference.collection_name_plural}>`);
        }

        //@ts-expect-error
        (this.vue[document.reference.collection_name_plural] as Map).set(document_id, cloned_data);

        if(collect_garbage) { this._collect_garbage(); }
    }

    /*
        Marks everything reachable from the roots and deletes the rest.

        A link is reachable if it's a root, or if both its document and its generator are.
        A query is reachable if any link pointing at it is.
        A generator is reachable if its query is, and some link contributing it is.
        A document is reachable if any query it belongs to is.
    */
    _collect_garbage() {
        let marked = new Set<Link | Query | Generator | Document>();
        let queue: (Link | Query | Generator | Document)[] = [];
        let mark = (node: Link | Query | Generator | Document) => {
            if(marked.has(node)) { return; }
            marked.add(node);
            queue.push(node);
        };

        this.roots.forEach(mark);
        while(queue.length > 0) {
            let node = queue.pop()!;
            if(node instanceof Link) {
                if(node.query) { mark(node.query); }
                for(let generator of node.contributed) {
                    if(marked.has(generator.parent_query)) { mark(generator); }
                }
            } else if(node instanceof Query) {
                node.documents.forEach(mark);
                for(let generator of node.generators.values()) {
                    if(Array.from(generator.sources).some(source => marked.has(source))) { mark(generator); }
                }
            } else if(node instanceof Generator) {
                for(let link of node.links) {
                    if(marked.has(link.document!)) { mark(link); }
                }
            } else {
                for(let [generator, link] of node.links) {
                    if(marked.has(generator)) { mark(link); }
                }
            }
        }

        // delete what wasn't reached, and detach it from what was
        for(let query of Array.from(this.all_queries.values())) {
            if(!marked.has(query)) {
                this._debug(`deleting unreachable query ${query.id}`);
                this._delete_query(query);
                continue;
            }
            for(let link of Array.from(query.parents)) {
                if(!marked.has(link)) { query.parents.delete(link); }
            }
            for(let [fn, generator] of Array.from(query.generators)) {
                if(!marked.has(generator)) {
                    query.generators.delete(fn);
                    continue;
                }
                for(let source of Array.from(generator.sources)) {
                    if(!marked.has(source)) { generator.sources.delete(source); }
                }
                for(let link of Array.from(generator.links)) {
                    if(!marked.has(link)) { generator.links.delete(link); }
                }
            }
            for(let document of Array.from(query.documents)) {
                if(!marked.has(document)) { query.documents.delete(document); }
            }
        }

        for(let document of Array.from(this.documents.values())) {
            if(marked.has(document)) {
                for(let query of Array.from(document.parents)) {
                    if(!marked.has(query)) { document.parents.delete(query); }
                }
                for(let [generator, link] of Array.from(document.links)) {
                    if(!marked.has(link)) { document.links.delete(generator); }
                }
                continue;
            }

            this._debug(`deleting unreachable document ${document.id}`);
            this.documents.delete(document.id);
            if(!this.vue[document.reference.collection_name_plural]){
                throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app does not have a ${document.reference.collection_name_plural} key`)
            };
            if(!(this.vue[document.reference.collection_name_plural] instanceof Map)){
                throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app key ${document.reference.collection_name_plural} is not a map. It should be a Map<string, ${document.reference.collection_name_plural}>`)
            };
            this.vue[document.reference.collection_name_plural].delete(document.id);
        }
    }
}
