import { v4 as uuid } from 'uuid';
import { deep_equal } from './deep_equals.js';
class Document {
    id;
    vitamins;
    parents;
    links;
    reference;
    document;
    constructor(vitamins, reference, document) {
        this.vitamins = vitamins;
        this.parents = new Set();
        this.links = new Map();
        this.reference = reference;
        this.document = document;
        this.id = document._id;
    }
}
class Generator {
    parent_query;
    generator_function;
    sources;
    links;
    constructor(parent_query, generator_function) {
        this.parent_query = parent_query;
        this.generator_function = generator_function;
        this.sources = new Set();
        this.links = new Set();
    }
}
class Link {
    document;
    generator;
    query;
    contributed;
    pass;
    constructor(document, generator) {
        this.document = document;
        this.generator = generator;
        this.contributed = new Set();
        this.pass = 0;
    }
}
class QueryShape {
    reference;
    collection_path;
    operation;
    document_id;
    query_parameters;
    constructor(reference, argument) {
        this.reference = reference;
        this.collection_path = this.reference.path.join('/');
        if (reference.query) {
            this.query_parameters = argument;
            this.operation = 'query';
        }
        else if (reference.get) {
            this.document_id = reference.document_id;
            this.operation = 'get';
        }
        else {
            throw new Error(`reference is not a collection reference or a query reference. Reexamine that argument.`);
        }
    }
    equals(query) {
        if (this === query) {
            return true;
        }
        if (query.operation !== this.operation) {
            return false;
        }
        if (query.collection_path !== this.collection_path) {
            return false;
        }
        if (query.document_id !== this.document_id) {
            return false;
        }
        if (this.query_parameters || query.query_parameters) {
            if (!this.query_parameters || !query.query_parameters) {
                return false;
            }
            if (!compare_query_parameters(query.query_parameters, this.query_parameters)) {
                return false;
            }
        }
        return true;
    }
}
class QuerySpec extends QueryShape {
    vitamins;
    child_generators;
    constructor(vitamins, reference, argument, child_generators = []) {
        super(reference, argument);
        this.vitamins = vitamins;
        this.child_generators = child_generators;
    }
    async run() {
        let vitamins = this.vitamins;
        vitamins._debug(`running ${this.reference.collection_id}`);
        let root = new Link();
        vitamins.roots.add(root);
        let { query, fetch } = vitamins._resolve(this, root);
        if (fetch) {
            await fetch;
        }
        else {
            vitamins._collect_garbage();
        }
        return {
            query,
            get_results: query.get_results.bind(query),
            rerun: query.rerun.bind(query),
            unlisten: () => {
                vitamins.unlisten_query(root);
            }
        };
    }
}
class Query extends QueryShape {
    id;
    vitamins;
    documents;
    parents;
    generators;
    external_root;
    has_run;
    run_wait;
    #fulfill_run_wait;
    last_result;
    constructor(vitamins, shape) {
        super(shape.reference, shape.query_parameters);
        this.id = uuid();
        vitamins._debug(`constructing query ${this.reference.collection_id} ${this.id}`);
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
        this.vitamins._debug(`RERUNNING QUERY`);
        this.has_run = false;
        this.run_wait = new Promise((resolve, reject) => {
            this.#fulfill_run_wait = resolve;
        });
        await this._fetch();
    }
    async _fetch() {
        if (this.has_run) {
            return;
        }
        this.has_run = true;
        try {
            if (this.operation === 'get') {
                let reference = this.reference;
                let result = await reference.get();
                if (result) {
                    this.vitamins._update_data(reference, result._id, result, this);
                }
            }
            else if (this.operation === 'query') {
                let reference = this.reference;
                let results = await reference.query(this.query_parameters);
                for (let result of results) {
                    this.vitamins._update_data(reference, result._id, result, this, false);
                }
                this.vitamins._collect_garbage();
                if (results.length > 0) {
                    this.last_result = results[results.length - 1];
                }
            }
        }
        catch (err) {
            return Promise.reject(err);
        }
        finally {
            this.#fulfill_run_wait(true);
        }
    }
    clone() {
        return new QuerySpec(this.vitamins, this.reference, structuredClone(this.query_parameters), Array.from(this.generators.keys()));
    }
    async next_page() {
        if (this.operation !== 'query') {
            throw new Error(`can only paginate queries`);
        }
        if (!this.last_result) {
            throw new Error(`tried to paginate before the last results were loaded.`);
        }
        let next_query = this.clone();
        if (!next_query.query_parameters) {
            next_query.query_parameters = {};
        }
        next_query.query_parameters.cursor = this.last_result._id;
        return await next_query.run();
    }
    async get_results() {
        await this.run_wait;
        return Array.from(this.documents).map((document) => {
            return this.vitamins.vue[document.reference.collection_name_plural].get(document.id);
        });
    }
    static find_query(queries, target) {
        for (let query of queries) {
            if (query.equals(target)) {
                return query;
            }
        }
        return undefined;
    }
}
function compare_query_parameters(a, b) {
    let key_value_a = Object.entries(a);
    if (key_value_a.length !== Object.keys(b).length) {
        return false;
    }
    for (let [key, value_a] of key_value_a) {
        let value_b = b[key];
        if (typeof value_a !== typeof value_b) {
            return false;
        }
        if (Array.isArray(value_a)) {
            if (!Array.isArray(value_b)) {
                return false;
            }
            if (!compare_array(value_a, value_b)) {
                return false;
            }
        }
        else if (value_a !== value_b) {
            if (typeof value_a === 'object') {
                return deep_equal(value_a, value_b);
            }
            return false;
        }
    }
    return true;
}
function compare_array(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let q = 0; q < a.length; q++) {
        if (a[q] !== b[q]) {
            return false;
        }
    }
    return true;
}
function quickprint(query) {
    return {
        id: query.id,
        collection: query.reference.collection_id,
        query_parameters: query.query_parameters
    };
}
export class Vitamins {
    vue;
    documents;
    all_queries;
    queries_by_collection;
    debug_on;
    roots;
    _rewalking_queries;
    _pass;
    constructor(vue) {
        this.vue = vue;
        this.documents = new Map();
        this.queries_by_collection = new Map();
        this.all_queries = new Map();
        this.debug_on = false;
        this.roots = new Set();
        this._rewalking_queries = new Set();
        this._pass = 0;
    }
    document(document, ...generators) {
        return new QuerySpec(this, document, undefined, generators);
    }
    query(collection, query_parameters, ...generators) {
        return new QuerySpec(this, collection, query_parameters ?? {}, generators);
    }
    unlisten_query(root) {
        this._remove_link(root);
        this._collect_garbage();
    }
    add_document_from_external(collection, data) {
        let shape = new QueryShape(collection);
        this._debug(`adding document from external ${shape.reference.collection_id}`);
        let self = this._find_existing_query(shape);
        if (self) {
            this._debug(`using existing query ${self.id}`);
        }
        else {
            self = new Query(this, shape);
            this._add_query(self);
        }
        self.has_run = true;
        if (!self.external_root) {
            self.external_root = new Link();
            self.external_root.query = self;
            self.parents.add(self.external_root);
            this.roots.add(self.external_root);
        }
        this._update_data(self.reference, data._id, data, self);
    }
    delete_document_from_external(document_id) {
        let document = this.documents.get(document_id);
        if (!document) {
            return;
        }
        for (let query of document.parents) {
            query.documents.delete(document);
        }
        document.parents.clear();
        this._collect_garbage();
    }
    update_document_from_external(document_id, data) {
        return this._update_data(undefined, document_id, data);
    }
    _debug(...print) {
        if (this.debug_on) {
            console.log(...print);
        }
    }
    _find_existing_query(query) {
        let collection_queries = this.queries_by_collection.get(query.reference.collection_id) ?? new Set();
        let existing_query = Query.find_query(Array.from(collection_queries), query);
        return existing_query;
    }
    _add_query(query) {
        this._debug(`attaching query ${query.id}`);
        if (!this.queries_by_collection.has(query.reference.collection_id)) {
            this.queries_by_collection.set(query.reference.collection_id, new Set());
        }
        let queries = this.queries_by_collection.get(query.reference.collection_id);
        queries.add(query);
        this.all_queries.set(query.id, query);
    }
    _delete_query(query) {
        this.queries_by_collection.get(query.reference.collection_id)?.delete(query);
        this.all_queries.delete(query.id);
    }
    _add_document(document) {
        this.documents.set(document.document._id, document);
    }
    _resolve(spec, link) {
        let self = this._find_existing_query(spec);
        let is_new = !self;
        if (!self) {
            self = new Query(this, spec);
            this._add_query(self);
        }
        else {
            this._debug(`resolved ${spec.reference.collection_id} to existing query ${self.id}`);
        }
        if (link.query !== self) {
            if (link.query) {
                link.query.parents.delete(link);
                this._set_contributed(link, []);
            }
            link.query = self;
            self.parents.add(link);
        }
        let added = this._set_contributed(link, spec.child_generators);
        if (is_new) {
            return { query: self, fetch: self._fetch() };
        }
        if (added.length > 0 && !this._rewalking_queries.has(self)) {
            this._rewalking_queries.add(self);
            try {
                for (let document of Array.from(self.documents)) {
                    for (let generator of added) {
                        this._apply_generator(document, generator);
                    }
                }
            }
            finally {
                this._rewalking_queries.delete(self);
            }
        }
        return { query: self };
    }
    _set_contributed(link, fns) {
        let added = [];
        for (let generator of Array.from(link.contributed)) {
            if (fns.includes(generator.generator_function)) {
                continue;
            }
            link.contributed.delete(generator);
            generator.sources.delete(link);
        }
        let query = link.query;
        for (let fn of fns) {
            let generator = query.generators.get(fn);
            if (!generator) {
                generator = new Generator(query, fn);
                query.generators.set(fn, generator);
                added.push(generator);
            }
            generator.sources.add(link);
            link.contributed.add(generator);
        }
        return added;
    }
    _apply_generator(document, generator) {
        let child_query = generator.generator_function(document.document);
        let link = document.links.get(generator);
        if (!child_query) {
            if (link) {
                this._remove_link(link);
            }
            return;
        }
        if (!link) {
            link = new Link(document, generator);
            document.links.set(generator, link);
            generator.links.add(link);
        }
        link.pass = this._pass;
        this._resolve(child_query, link);
    }
    _remove_link(link) {
        if (link.document && link.generator) {
            link.document.links.delete(link.generator);
        }
        link.generator?.links.delete(link);
        link.query?.parents.delete(link);
        for (let generator of link.contributed) {
            generator.sources.delete(link);
        }
        link.contributed.clear();
        this.roots.delete(link);
    }
    _update_data(reference, document_id, data, query, collect_garbage = true) {
        let document = this.documents.get(document_id);
        if (!document) {
            if (!reference) {
                return;
            }
            document = new Document(this, reference, data);
            this._add_document(document);
        }
        this._debug(`updating data for a ${document.reference.collection_id} ${document_id}`);
        let pass = ++this._pass;
        document.document = data;
        if (query) {
            query.documents.add(document);
            document.parents.add(query);
        }
        for (let parent_query of Array.from(document.parents)) {
            for (let generator of Array.from(parent_query.generators.values())) {
                if (generator.sources.size === 0) {
                    continue;
                }
                this._apply_generator(document, generator);
            }
        }
        for (let link of Array.from(document.links.values())) {
            if (link.pass !== pass) {
                this._remove_link(link);
            }
        }
        let cloned_data = structuredClone(data);
        if (!this.vue[document.reference.collection_name_plural]) {
            throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app does not have a ${document.reference.collection_name_plural} key`);
        }
        if (!(this.vue[document.reference.collection_name_plural] instanceof Map)) {
            throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app key ${document.reference.collection_name_plural} is not a map. It should be a Map<string, ${document.reference.collection_name_plural}>`);
        }
        this.vue[document.reference.collection_name_plural].set(document_id, cloned_data);
        if (collect_garbage) {
            this._collect_garbage();
        }
    }
    _collect_garbage() {
        let marked = new Set();
        let queue = [];
        let mark = (node) => {
            if (marked.has(node)) {
                return;
            }
            marked.add(node);
            queue.push(node);
        };
        this.roots.forEach(mark);
        while (queue.length > 0) {
            let node = queue.pop();
            if (node instanceof Link) {
                if (node.query) {
                    mark(node.query);
                }
                for (let generator of node.contributed) {
                    if (marked.has(generator.parent_query)) {
                        mark(generator);
                    }
                }
            }
            else if (node instanceof Query) {
                node.documents.forEach(mark);
                for (let generator of node.generators.values()) {
                    if (Array.from(generator.sources).some(source => marked.has(source))) {
                        mark(generator);
                    }
                }
            }
            else if (node instanceof Generator) {
                for (let link of node.links) {
                    if (marked.has(link.document)) {
                        mark(link);
                    }
                }
            }
            else {
                for (let [generator, link] of node.links) {
                    if (marked.has(generator)) {
                        mark(link);
                    }
                }
            }
        }
        for (let query of Array.from(this.all_queries.values())) {
            if (!marked.has(query)) {
                this._debug(`deleting unreachable query ${query.id}`);
                this._delete_query(query);
                continue;
            }
            for (let link of Array.from(query.parents)) {
                if (!marked.has(link)) {
                    query.parents.delete(link);
                }
            }
            for (let [fn, generator] of Array.from(query.generators)) {
                if (!marked.has(generator)) {
                    query.generators.delete(fn);
                    continue;
                }
                for (let source of Array.from(generator.sources)) {
                    if (!marked.has(source)) {
                        generator.sources.delete(source);
                    }
                }
                for (let link of Array.from(generator.links)) {
                    if (!marked.has(link)) {
                        generator.links.delete(link);
                    }
                }
            }
            for (let document of Array.from(query.documents)) {
                if (!marked.has(document)) {
                    query.documents.delete(document);
                }
            }
        }
        for (let document of Array.from(this.documents.values())) {
            if (marked.has(document)) {
                for (let query of Array.from(document.parents)) {
                    if (!marked.has(query)) {
                        document.parents.delete(query);
                    }
                }
                for (let [generator, link] of Array.from(document.links)) {
                    if (!marked.has(link)) {
                        document.links.delete(generator);
                    }
                }
                continue;
            }
            this._debug(`deleting unreachable document ${document.id}`);
            this.documents.delete(document.id);
            if (!this.vue[document.reference.collection_name_plural]) {
                throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app does not have a ${document.reference.collection_name_plural} key`);
            }
            ;
            if (!(this.vue[document.reference.collection_name_plural] instanceof Map)) {
                throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app key ${document.reference.collection_name_plural} is not a map. It should be a Map<string, ${document.reference.collection_name_plural}>`);
            }
            ;
            this.vue[document.reference.collection_name_plural].delete(document.id);
        }
    }
}
//# sourceMappingURL=vitamins.js.map