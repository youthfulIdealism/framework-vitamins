import { v4 as uuid } from 'uuid'
import { App, Ref } from 'vue'
import { generated_collection_interface, generated_document_interface, Infer_Collection_Returntype, result } from './type_generated_collection.js'


type query_operation = "get" | "query";
type child_generator<T extends result> = (result: T) => Query | undefined;



class Document {
    id: string;

    vitamins: Vitamins;
    children: Set<string>;
    parents: Set<string>;
    reference: generated_collection_interface<result> | generated_document_interface<result>;
    document: result;

    constructor(vitamins: Vitamins, reference: generated_collection_interface<result> | generated_document_interface<result>, document: result) {
        this.vitamins = vitamins;
        this.children = new Set();
        this.parents = new Set();
        
        this.reference = reference;
        this.document = document;
        this.id = document._id;
    }

    unlink_parent(id: string) {
        this.parents.delete(id);
    }
}

class Query {
    id: string;
    vitamins: Vitamins;
    children: Set<string>;
    parents: Set<string>;

    reference: generated_collection_interface<result> | generated_document_interface<result>;
    collection_path: string;
    operation: query_operation;
    document_id?: string;
    query_parameters?: any;

    child_generators: child_generator<result>[];
    has_run: boolean;

    last_result?: result;

    constructor(vitamins: Vitamins, reference: generated_collection_interface<result> | generated_document_interface<result>, argument?: object, child_generators: child_generator<result>[] = []){
        this.id = uuid();
        vitamins._debug(`constructing query ${reference.collection_id} ${this.id}`)
        this.children = new Set();
        this.parents = new Set();
        this.vitamins = vitamins;
        this.reference = reference;
        this.child_generators = child_generators;
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
        this.has_run = false;
    }

    async rerun() {
        this.vitamins._debug(`RERUNNING QUERY`)
        this.has_run = false;
        await this._fetch();
    }

    async run(run_from_root: boolean = true): Promise<Query> {
        this.vitamins._debug(`running ${this.reference.collection_id} ${this.id}`)
       
        // automatically replace yourself with an existing query if appliccable
        let self = this.vitamins._find_existing_query(this) ?? this;
        if(self.id !== this.id) { this.vitamins._debug(`replacing self ${this.id} with doppleganger ${self.id}`)}

        if(run_from_root && !self.parents.has('root')){
            self.parents.add('root');
        }

        self.vitamins._add_query(self);

        // if we already had that query,....
        if(self.id !== this.id){
            // if the existing query is missing parents, add them
            for(let parent_id of this.parents){
                self.parents.add(parent_id)
            }

            // if any generators were specified, look for new ones and add them.
            let new_child_generators = this.child_generators.filter(ele => !self.child_generators.includes(ele))
            for(let generator of new_child_generators) {
                self.vitamins._debug(`ADDING CHILD GENERATOR`)
                self.vitamins._debug(generator)
                self.child_generators.push(generator);
            }

            // generate the child queries for the new generators, since that wouldn't otherwise happen.
            for(let child_id of self.children) {
                let document = self.vitamins.documents.get(child_id);
                let generated_child_queries = self.vitamins._generate_child_queries(document);
                generated_child_queries.forEach(ele => self.vitamins._add_query(ele));
                generated_child_queries.forEach(ele => ele.run());
            }
        } else {
            await self._fetch();
        }

        return self;
    }

    async _fetch(){
        if(this.has_run){ return; }
        this.has_run = true;
        try {
            if(this.operation === 'get'){
                let reference = this.reference as generated_document_interface<result>;
                // TODO: how do I want to handle errors? This clearly needs to be in a try-catch.
                let result = await reference.get();

                this.vitamins._update_data(reference, result._id, result, this);
            } else if(this.operation === 'query'){
                let reference = this.reference as generated_collection_interface<result>;
                // TODO: how do I want to handle errors? This clearly needs to be in a try-catch.
                let results = await reference.query(this.query_parameters);
                for(let result of results){
                    this.vitamins._update_data(reference, result._id, result, this);
                }
                if(results.length > 0){ this.last_result = results[results.length - 1]; }
            }
        } catch(err){
            return Promise.reject(err);
        }
    }

    link_child(document: Document) {
        this.children.add(document.id);
        document.parents.add(this.id);
    }

    link_parent(document: Document) {
        this.parents.add(document.id);
        document.children.add(this.id);
    }

    unlink_child(id: string) {
        this.children.delete(id);
    }

    unlink_parent(id: string) {
        this.parents.delete(id);
    }

    equals(query: Query) {
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

    clone() {
        return new Query(this.vitamins, this.reference, this.query_parameters.structuredClone(), this.child_generators);
    }

    async next_page() {
        if(this.operation !== 'query'){ throw new Error(`can only paginate queries`); }
        if(!this.last_result){ throw new Error(`tried to paginate before the last results were loaded.`); }
        let next_query = this.clone();
        if(!next_query.query_parameters){ next_query.query_parameters = {}; }
        next_query.query_parameters.cursor = this.last_result._id;
        return await next_query.run();
    }

    static find_query(queries: Query[], target: Query){
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

    constructor(vue: App | any) {
        this.vue = vue;
        this.documents = new Map();
        this.queries_by_collection = new Map();
        this.all_queries = new Map()
        this.debug_on = false;
    }

    document<Document extends generated_document_interface<result>>(collection: Document, ...generators: child_generator<Infer_Collection_Returntype<Document>>[]): Query {
        // if queries_by_collection does not yet have a key for the relevant collection, create one. 
        if(!this.queries_by_collection.has(collection.collection_id)){ this.queries_by_collection.set(collection.collection_id, new Set()); }
        
        // if the created query already exists within the system, set up to return the existing query instead
        let generated_query = new Query(this, collection, undefined, generators);
        //let replacement_query = this._find_existing_query(generated_query) ?? generated_query;
        //if(generated_query.id !== replacement_query.id) { this._debug(`replacing generated query ${generated_query.id} with existing doppleganger ${replacement_query.id}`)}

        //return query;
        return generated_query;
    }

    query<Collection extends generated_collection_interface<result>>(collection: Collection, query_parameters: any, ...generators: child_generator<Infer_Collection_Returntype<Collection>>[]): Query {
        // if queries_by_collection does not yet have a key for the relevant collection, create one. 
        if(!this.queries_by_collection.has(collection.collection_id)){ this.queries_by_collection.set(collection.collection_id, new Set()); }
        let generated_query = new Query(this, collection, query_parameters ?? {}, generators);
        return generated_query;
    }

    unlisten_query(query: Query) {
        query.parents.delete('root');
        this._cleanup([query], []);
    }

    add_document_from_external<Document extends generated_document_interface<result>>(collection: Document, data: result) {
        if(!this.queries_by_collection.has(collection.collection_id)){ this.queries_by_collection.set(collection.collection_id, new Set()); }
        let generated_query = new Query(this, collection, undefined);

        this._debug(`adding document from external ${generated_query.reference.collection_id} ${generated_query.id}`)
        let self = this._find_existing_query(generated_query) ?? generated_query;
        if(self.id !== generated_query.id){
            this._debug(`replacing self with doppleganger ${self.id}`);
        }
        self.has_run = true;
        this._add_query(self);
        this._update_data(self.reference, data._id, data, self);
    }

    delete_document_from_external(document_id: string) {
        let document = this.documents.get(document_id);
        if(!document) { return; }
        let parent_queries = Array.from(document.parents).map(ele => this.all_queries.get(ele));
        document.parents.clear();
        let child_queries =  Array.from(document.children).map(ele => this.all_queries.get(ele));
        document.children.clear();
        parent_queries.forEach(ele => ele.unlink_child(document_id));
        child_queries.forEach(ele => ele.unlink_parent(document_id));
        this._cleanup([...parent_queries, ...child_queries], [document]);
    }

    update_document_from_external(document_id: string, data: result) {
        return this._update_data(undefined, document_id, data);
    }

    _debug(...print: any[]) {
        if(this.debug_on){ console.log(...print); }
    }

    _find_existing_query(query: Query) {
        let collection_queries = this.queries_by_collection.get(query.reference.collection_id);
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
        let queries = this.queries_by_collection.get(query.reference.collection_id);
        queries.add(query);
        this.all_queries.set(query.id, query);
    }

    _delete_query(query: Query) {
        this.queries_by_collection.get(query.reference.collection_id).delete(query);
        this.all_queries.delete(query.id);
    }

    _add_document(document: Document) {
        this.documents.set(document.document._id, document);
    }

    // TODO: do I need to be accepting an array of documents so that I can link/unlink all of them?
    _update_data(reference: generated_collection_interface<result> | generated_document_interface<result> | undefined, document_id: string, data: result, query?: Query) {
        // if this document doesn't already exist, create it.
        let document = this.documents.get(document_id);
        if(!document && reference) {
            document = new Document(this, reference, data);
            this._add_document(document);
        }
        if(!document && !reference){ return; }

        this._debug(`updating data for a ${document.reference.collection_id} ${document_id}`);

        // update the data for the document 
        document.document = data;

        // make the query a parent of the document. Query's parent_of method already checks to make sure it's
        // not already a parent, so you don't need to do that again here.
        if(query){
            query.link_child(document);
        }
        

        // remove doc's existing children, because we're regenerating all the query connections
        let document_previous_children = Array.from(document.children);
        document.children.clear();

        for(let child_query_id of document_previous_children) {
            this.all_queries.get(child_query_id).unlink_parent(document.id);
        }

        // get the full set of parent queries so that we can re-generate any child queries.
        let generated_child_queries = this._generate_child_queries(document);
        generated_child_queries.forEach(ele => this._add_query(ele));
        //generated_child_queries.forEach(ele => this._debug(quickprint(ele)))

        generated_child_queries.forEach(ele => ele.run(false));
        
        let test_queries_for_deletion: Query[] = document_previous_children.map(query_id => this.all_queries.get(query_id));
        let bugfind = Array.from(document_previous_children).filter(id => !this.all_queries.has(id))
        if(bugfind.length > 0){ this._debug(`BREAKING ID:`); this._debug(bugfind); }

        this._cleanup(test_queries_for_deletion, []);
        
        

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
    }

    _generate_child_queries(document: Document): Query[] {
        // each query produces documents. So if you get an institution, the query will
        // produce institution documents. These documents are registered as children of the query.
        // each query also has the ability to produce more queries, which are registered as query generators.
        // So, the general process to generate child queries is to find all the child documents
        // of a query, call the query generator for each child document, and--ifs
        // the query hasn't been generated before--attach it to the child document.

        // keep a list of all the queries generated, so that we can return them at the end of this process
        let all_generated_child_queries: Query[] = [];

        for(let query_parent_id of document.parents) {
            let query_parent = this.all_queries.get(query_parent_id);

            let generated_child_queries = (query_parent.child_generators ?? []).map(generator => generator(document.document)).filter(ele => ele);
            for(let q = 0; q < generated_child_queries.length; q++){
                // if we already had the child query, use the existing one instead of the new one
                let generated_child_query = generated_child_queries[q];
                // This was a nice idea, but it doesn't work, because comparing queries
                // doesn't discover if they have equivalent *child* queries. the game here
                // has to be to let the deduper in .run() do the work.
                /*let query = this._find_existing_query(generated_child_query) ?? generated_child_query;
                if(generated_child_query.id !== query.id ){
                    generated_child_queries[q] = query;
                    generated_child_query = query;
                }*/
                //this._add_query(generated_child_query);
                generated_child_query.link_parent(document);
            }
            all_generated_child_queries.push(...generated_child_queries);
        }
        return Array.from(new Set(all_generated_child_queries));
    }

    _cleanup(queries: Query[], documents: Document[]){
        let check_queries_queue = queries.slice();
        let check_documents_queue = documents.slice();

        while(check_queries_queue.length > 0 || check_documents_queue.length > 0) {
            while(check_queries_queue.length > 0){
                let query = check_queries_queue.pop();
                if(query.parents.size > 0){ continue; }
                this._debug(`deleting parentless query ${query.id}`);
                
                for(let child_id of query.children){
                    let child = this.documents.get(child_id);
                    check_documents_queue.push(child);
                    child.unlink_parent(query.id);
                }

                // remove the query from our set of queries
                this._delete_query(query);
            }
            
            while(check_documents_queue.length > 0){
                let document = check_documents_queue.pop();
                if(document.parents.size > 0){ continue; }
                this._debug(`deleting parentless document ${document.id}`);

                for(let child_id of document.children){
                    let child = this.all_queries.get(child_id);
                    check_queries_queue.push(this.all_queries.get(child_id));
                    child.unlink_parent(document.id);
                }

                this.documents.delete(document.id);
                if(!this.vue[document.reference.collection_name_plural]){
                    throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app does not have a ${document.reference.collection_name_plural} key`)
                };

                //@ts-expect-error
                if(!this.vue[document.reference.collection_name_plural] instanceof Map){
                    throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app key ${document.reference.collection_name_plural} is not a map. It should be a Map<string, ${document.reference.collection_name_plural}>`)
                };
                this.vue[document.reference.collection_name_plural].delete(document.id);
            }
        }
    }
}