import { App } from 'vue'
import { generated_collection_interface, generated_document_interface, result } from './type_generated_collection.js'

type query_operation = "get" | "query";
//type generator_arguments = [generated_collection_interface | generated_document_interface, string | any, ...child_generator[]]
type child_generator = (result: result) => Query;



class Document {
    id: string;

    vitamins: Vitamins;
    children: Query[];
    parents: Query[];
    reference: generated_collection_interface | generated_document_interface;
    document: result;

    constructor(vitamins: Vitamins, reference: generated_collection_interface | generated_document_interface, document: result) {
        this.vitamins = vitamins;
        this.children = [];
        this.parents = [];
        
        this.reference = reference;
        this.document = document;
        this.id = document._id;
    }

    unlink_parent(query: Query){
        for(let q = 0; q < this.parents.length; q++) {
            if(typeof this.parents[q] === 'string') { continue; }
            if(this.parents[q].equals(query)) {
                this.parents.splice(q, 1);
                break;
            }
        }
    }
}

class Query {
    vitamins: Vitamins;
    children: Document[];
    parents: (Document | string)[];

    reference: generated_collection_interface | generated_document_interface;
    collection_path: string;
    operation: query_operation;
    id?: string;
    query_parameters?: any;

    child_generators: child_generator[];
    has_run: boolean;

    constructor(vitamins: Vitamins, reference: generated_collection_interface | generated_document_interface, argument?: object, child_generators: child_generator[] = []){
        this.children = [];
        this.parents = [];
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
            this.id = (reference as generated_document_interface).document_id;
            this.collection_path = [...this.reference.path, this.id].join('/')
            this.operation = 'get';
        } else {
            throw new Error(`reference is not a collection reference or a query reference. Reexamine that argument.`)
        }
        this.has_run = false;
    }

    async run(){
        console.log(`running ${this.reference.collection_id}`)
        if(!this.parents.includes('root')){
            this.parents.push('root');
        }

        this.vitamins._add_query(this);

        await this._fetch();
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
        let has_child_already = false;
        for(let child of this.children) {
            if(child.id === document.id){
                has_child_already = true;
                break;
            }
        }

        if(!has_child_already){
            this.children.push(document);
        }

        let document_has_parent = false;
        for(let query of document.parents) {
            if(query.equals(this)){
                document_has_parent = true;
                break;
            }
        }

        if(!document_has_parent){
            document.parents.push(this);
        }
    }

    link_parent(document: Document) {
        let has_parent_already = false;
        for(let parent of this.parents) {
            if(typeof parent === 'string'){ continue; }
            if(parent.id === document.id){
                has_parent_already = true;
                break;
            }
        }

        if(!has_parent_already){
            this.parents.push(document);
        }

        let document_has_child = false;
        for(let query of document.children) {
            if(query.equals(this)){
                document_has_child = true;
                break;
            }
        }

        if(!document_has_child){
            document.children.push(this);
        }
    }

    unlink_child(document: Document) {
        for(let q = 0; q < this.children.length; q++) {
            if(this.children[q].id === document.id) {
                this.children.splice(q, 1);
                break;
            }
        }
    }

    unlink_parent(document: Document) {
        for(let q = 0; q < this.parents.length; q++) {
            if(typeof this.parents[q] === 'string'){ continue; }
            if((this.parents[q] as Document).id === document.id) {
                this.parents.splice(q, 1);
                break;
            }
        }
    }

    equals(query: Query) {
        if(this === query){ return true;}
        if(query.operation !== this.operation){ return false; }
        if(query.collection_path !== this.collection_path) { return false; }
        if(query.id !== this.id) { return false; }
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
    //collections: Map<string, Map<string, Document>>;
    documents: Map<string, Document> // document id -> document
    queries: Map<string, Query[]>// collection id -> document[]

    constructor(vue: App) {
        this.vue = vue;
        //this.collections = new Map();
        this.documents = new Map();
        this.queries = new Map();
    }

    // TODO: remove entirely?
    /*async get(collection: generated_document_interface, ...generators: child_generator[]) {
        if(!this.queries.has(collection.collection_id)){
            this.queries.set(collection.collection_id, []);
        }
        let collection_queries = this.queries.get(collection.collection_id)


        let query = new Query(this, collection, undefined, generators);
        
        // if this query is already in the system, use the existing one.
        let existing_query = Query.find_query(collection_queries, query)
        if(existing_query){ query = existing_query;}

        // TODO: make this a UUID and add a method to remove root queries via uuid?
        query.parents.push('root');

        

        await query.run();
    }*/

    query(collection: generated_collection_interface, query_parameters: any, ...generators: child_generator[]): Query {
        if(!this.queries.has(collection.collection_id)){ this.queries.set(collection.collection_id, []); }
        let collection_queries = this.queries.get(collection.collection_id)
        let query = new Query(this, collection, query_parameters, generators);

        let existing_query = Query.find_query(collection_queries, query)
        if(existing_query){
            query = existing_query;
            if(generators.length > 0){
                query.child_generators.push(...generators);
            }
            
        }

        return query;
    }

    _add_query(query: Query, force: boolean = false) {
        if(!this.queries.has(query.reference.collection_id)){
            this.queries.set(query.reference.collection_id, []);
        }
        let queries = this.queries.get(query.reference.collection_id)
        if(force || !Query.find_query(queries, query)){
            queries.push(query);
        }
    }

    _add_document(document: Document) {
        if(!this.documents.get(document.document._id)){
            this.documents.set(document.document._id, document);
        }
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
        let all_parent_queries = document.parents;

        let generated_child_queries = all_parent_queries.flatMap(ele => ele.child_generators).map(ele => ele(data));

        let test_queries_for_deletion: Query[] = document.children;

        // if any of the child queries are already in use, operate on those instead of the freshly-generated ones.
        for(let q = 0; q < generated_child_queries.length; q++){
            let generated_child_query = generated_child_queries[q];
            let collection_query_list = this.queries.get(generated_child_query.reference.collection_id) ?? [];
            let existing_query = Query.find_query(collection_query_list, generated_child_query);
            if(existing_query){ generated_child_queries[q] = existing_query; }
            else { this._add_query(generated_child_query, true); }
        }

        // disconnect and reconnect children, so that any used children are
        // connected and any unused children get disconnected
        for(let parent_query of document.parents){
            parent_query.unlink_child(document);
        }
        document.parents = generated_child_queries;

        for(let child_query of generated_child_queries){
            child_query.link_parent(document);
        }

        this._cleanup(test_queries_for_deletion, []);
        
        generated_child_queries.forEach(ele => ele.run());

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

    _run_child_queries(query: Query, ){

    }

    _cleanup(queries: Query[], documents: Document[]){
        let check_queries_queue = queries.slice();
        let check_documents_queue = documents.slice();

        while(check_queries_queue.length > 0 || check_documents_queue.length > 0) {
            while(check_queries_queue.length > 0){
                let query = check_queries_queue.pop();
                if(query.parents.length > 0){ continue; }
                
                for(let child of query.children){
                    check_documents_queue.push(child);
                    child.unlink_parent(query);
                }

                let query_list = this.queries.get(query.reference.collection_id);
                for(let q = 0; q < query_list.length; q++) {
                    if(query_list[q].equals(query)){
                        query_list.splice(q, 1);
                        break;
                    }
                }
            }
            
            while(check_documents_queue.length > 0){
                let document = check_documents_queue.pop();
                if(document.parents.length > 0){ continue; }

                for(let child of document.children){
                    check_queries_queue.push(child);
                    child.unlink_parent(document);
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