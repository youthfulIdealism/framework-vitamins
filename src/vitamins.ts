import { v4 as uuid } from 'uuid'
import { App } from 'vue'
import { generated_collection_interface, generated_document_interface, result } from './type_generated_collection.js'

type query_operation = "get" | "query";
type child_generator = (result: result) => Query;



class Document {
    id: string;

    vitamins: Vitamins;
    children: Set<string>;
    parents: Set<string>;
    reference: generated_collection_interface | generated_document_interface;
    document: result;

    constructor(vitamins: Vitamins, reference: generated_collection_interface | generated_document_interface, document: result) {
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

    reference: generated_collection_interface | generated_document_interface;
    collection_path: string;
    operation: query_operation;
    document_id?: string;
    query_parameters?: any;

    child_generators: child_generator[];
    has_run: boolean;

    constructor(vitamins: Vitamins, reference: generated_collection_interface | generated_document_interface, argument?: object, child_generators: child_generator[] = []){
        this.id = uuid();
        this.children = new Set();
        this.parents = new Set();
        this.vitamins = vitamins;
        this.reference = reference;
        this.child_generators = child_generators;
        // if the reference has a query method, then it's a collection reference and we should do query operations on it
        if((reference as generated_collection_interface).query) {
            console.log(`${this.reference.collection_id} as query`)
            this.query_parameters = argument as any;
            this.collection_path = this.reference.path.join('/')
            this.operation = 'query';
        } else if((reference as generated_document_interface).get) {// if the reference has a get method, then it's a document reference and we should do get operations on it
            console.log(`${this.reference.collection_id} as docuemnt`)
            this.document_id = (reference as generated_document_interface).document_id;
            this.collection_path = [...this.reference.path, this.document_id].join('/')
            this.operation = 'get';
        } else {
            throw new Error(`reference is not a collection reference or a query reference. Reexamine that argument.`)
        }
        this.has_run = false;
    }

    async rerun() {
        console.log(`RERUNNING QUERY`)
        this.has_run = false;
        await this._fetch();
    }

    async run(run_from_root: boolean = true){
        console.log(`running ${this.reference.collection_id}`)
        if(run_from_root && !this.parents.has('root')){
            this.parents.add('root');
        }

        this.vitamins._add_query(this);

        await this._fetch();
        return this;
    }

    async _fetch(){
        if(this.has_run){ return; }
        this.has_run = true;
        console.log(`_fetching ${this.reference.collection_id}`)
        try {
            if(this.operation === 'get'){
                let reference = this.reference as generated_document_interface;
                // TODO: how do I want to handle errors? This clearly needs to be in a try-catch.
                let result = await reference.get();

                this.vitamins._update_data(this, reference, result._id, result);
            } else if(this.operation === 'query'){
                let reference = this.reference as generated_collection_interface;
                // TODO: how do I want to handle errors? This clearly needs to be in a try-catch.
                let results = await reference.query(this.query_parameters);
                for(let result of results){
                    this.vitamins._update_data(this, reference, result._id, result);
                }
            }
        } catch(err){
            console.error(err)
            throw err;
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



export class Vitamins {
    vue: App
    documents: Map<string, Document> // document id -> document
    all_queries: Map<string, Query>
    queries_by_collection: Map<string, Set<Query>>// collection id -> document[]

    constructor(vue: App) {
        this.vue = vue;
        this.documents = new Map();
        this.queries_by_collection = new Map();
        this.all_queries = new Map()
    }

    query(collection: generated_collection_interface, query_parameters: any, ...generators: child_generator[]): Query {
        // if queries_by_collection does not yet have a key for the relevant collection, create one. 
        if(!this.queries_by_collection.has(collection.collection_id)){ this.queries_by_collection.set(collection.collection_id, new Set()); }
        
        // if the created query already exists within the system, set up to return the existing query instead
        let generated_query = new Query(this, collection, query_parameters, generators);
        let query = this._find_existing_query(generated_query) ?? generated_query;

        // if we already had that query,....
        if(query !== generated_query){
            // if any generators were specified, look for new ones and add them.
            for(let generator of generators) {
                if(!query.child_generators.includes(generator)){
                    query.child_generators.push(generator);
                }
            }

            // generate the child queries for the new generators, since that wouldn't otherwise happen.
            this._generate_child_queries(query, generators);
        }

        return query;
    }

    _find_existing_query(query: Query) {
        let collection_queries = this.queries_by_collection.get(query.reference.collection_id);
        let existing_query = Query.find_query(Array.from(collection_queries), query);
        return existing_query;
    }

    _add_query(query: Query) {
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
    _update_data(parent_query: Query, reference: generated_collection_interface | generated_document_interface, document_id: string, data: result) {
        // if this document doesn't already exist, create it.
        let document = this.documents.get(document_id);
        if(!document) {
            document = new Document(this, reference, data);
            this._add_document(document);
        }

        // update the data for the document 
        document.document = data;

        // make the query a parent of the document. Query's parent_of method already checks to make sure it's
        // not already a parent, so you don't need to do that again here.
        // TODO: unlink documents!
        parent_query.link_child(document);

        // get the full set of parent queries so that we can re-generate any child queries.
        let generated_child_queries = this._generate_child_queries(parent_query);
        let test_queries_for_deletion: Query[] = Array.from(document.children).map(query_id => this.all_queries.get(query_id));

        //console.log(generated_child_queries)
        console.log(test_queries_for_deletion)

        // disconnect and reconnect children, so that any used children are
        // connected and any unused children get disconnected
        // TODO: REPLACE
        /*for(let parent_query of document.parents){
            parent_query.unlink_child(document);
        }
        document.parents = generated_child_queries;

        for(let child_query of generated_child_queries){
            child_query.link_parent(document);
        }*/

        this._cleanup(test_queries_for_deletion, []);
        
        generated_child_queries.forEach(ele => ele.run(false));

        /*
            Clone the response data to prevent any funkyness if it gets changed in the frontend code,
            and then load it into Vue.
        */
        let cloned_data = structuredClone(data);

        //@ts-expect-error
        if(!this.vue[reference.collection_id]){
            throw new Error(`when updating ${reference.collection_id}, found that the vue app does not have a ${reference.collection_id} key`);
        }

        //@ts-expect-error
        if(!(this.vue[reference.collection_id] instanceof Map)){
            throw new Error(`when updating ${reference.collection_id}, found that the vue app key ${reference.collection_id} is not a map. It should be a Map<string, ${reference.collection_id}>`);
        }

        //@ts-expect-error
        (this.vue[reference.collection_id] as Map).set(document_id, cloned_data);
    }

    _generate_child_queries(query: Query, generators?: child_generator[]): Query[] {
        // each query produces documents. So if you get an institution, the query will
        // produce institution documents. These documents are registered as children of the query.
        // each query also has the ability to produce more queries, which are registered as query generators.
        // So, the general process to generate child queries is to find all the child documents
        // of a query, call the query generator for each child document, and--if
        // the query hasn't been generated before--attach it to the child document.

        // keep a list of all the queries generated, so that we can return them at the end of this process
        let all_generated_child_queries: Query[] = [];

        // foe each child document,...
        for(let document_id of query.children){
            let document = this.documents.get(document_id);

            // generate the child queries,...
            let generated_child_queries = (generators ?? query.child_generators).map(generator => generator(document.document));
            for(let q = 0; q < generated_child_queries.length; q++){
                // if we already had the child query, use the existing one instead of the new one
                let generated_child_query = generated_child_queries[q];
                let query = this._find_existing_query(generated_child_query) ?? generated_child_query;
                if(generated_child_query !== query ){ generated_child_queries[q] = query; }
                else { this._add_query(generated_child_query); }// if we didn't have the child query, add it to the vitamins

                generated_child_query.link_parent(document);
            }

            // add all the queries to the list of all generated queries for later return
            all_generated_child_queries.push(...generated_child_queries)
        }
        return all_generated_child_queries;
    }

    _cleanup(queries: Query[], documents: Document[]){
        let check_queries_queue = queries.slice();
        let check_documents_queue = documents.slice();

        while(check_queries_queue.length > 0 || check_documents_queue.length > 0) {
            while(check_queries_queue.length > 0){
                let query = check_queries_queue.pop();
                if(query.parents.size > 0){ continue; }
                
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

                for(let child_id of document.children){
                    let child = this.all_queries.get(child_id);
                    check_queries_queue.push(this.all_queries.get(child_id));
                    child.unlink_parent(document.id);
                }

                this.documents.delete(document.id);
                //@ts-expect-error
                if(!this.vue[document.reference.collection_id]){
                    throw new Error(`when updating ${document.reference.collection_id}, found that the vue app does not have a ${document.reference.collection_id} key`)
                };

                //@ts-expect-error
                if(!this.vue[document.reference.collection_id] instanceof Map){
                    throw new Error(`when updating ${document.reference.collection_id}, found that the vue app key ${document.reference.collection_id} is not a map. It should be a Map<string, ${document.reference.collection_id}>`)
                };
                //@ts-expect-error
                (document.reference.collection_id as Map).delete(document.id);
            }
        }
    }

    // TOOD: I need a method that updates/deletes the document from an external source, so that I can reimplement the Synchronizer.
}