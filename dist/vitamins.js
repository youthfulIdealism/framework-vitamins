import { v4 as uuid } from 'uuid';
class Document {
    id;
    vitamins;
    children;
    parents;
    reference;
    document;
    constructor(vitamins, reference, document) {
        this.vitamins = vitamins;
        this.children = new Set();
        this.parents = new Set();
        this.reference = reference;
        this.document = document;
        this.id = document._id;
    }
    unlink_parent(id) {
        this.parents.delete(id);
    }
}
class Query {
    id;
    vitamins;
    children;
    parents;
    reference;
    collection_path;
    operation;
    document_id;
    query_parameters;
    child_generators;
    has_run;
    constructor(vitamins, reference, argument, child_generators = []) {
        this.id = uuid();
        this.children = new Set();
        this.parents = new Set();
        this.vitamins = vitamins;
        this.reference = reference;
        this.child_generators = child_generators;
        if (reference.query) {
            console.log(`${this.reference.collection_id} as query`);
            this.query_parameters = argument;
            this.collection_path = this.reference.path.join('/');
            this.operation = 'query';
        }
        else if (reference.get) {
            console.log(`${this.reference.collection_id} as docuemnt`);
            this.document_id = reference.document_id;
            this.collection_path = [...this.reference.path, this.document_id].join('/');
            this.operation = 'get';
        }
        else {
            throw new Error(`reference is not a collection reference or a query reference. Reexamine that argument.`);
        }
        this.has_run = false;
    }
    async rerun() {
        console.log(`RERUNNING QUERY`);
        this.has_run = false;
        await this._fetch();
    }
    async run(run_from_root = true) {
        console.log(`running ${this.reference.collection_id}`);
        if (run_from_root && !this.parents.has('root')) {
            this.parents.add('root');
        }
        this.vitamins._add_query(this);
        await this._fetch();
        return this;
    }
    async _fetch() {
        if (this.has_run) {
            return;
        }
        this.has_run = true;
        console.log(`_fetching ${this.reference.collection_id}`);
        try {
            if (this.operation === 'get') {
                let reference = this.reference;
                let result = await reference.get();
                this.vitamins._update_data(this, reference, result._id, result);
            }
            else if (this.operation === 'query') {
                let reference = this.reference;
                let results = await reference.query(this.query_parameters);
                for (let result of results) {
                    this.vitamins._update_data(this, reference, result._id, result);
                }
            }
        }
        catch (err) {
            console.error(err);
            throw err;
        }
    }
    link_child(document) {
        this.children.add(document.id);
        document.parents.add(this.id);
    }
    link_parent(document) {
        this.parents.add(document.id);
        document.children.add(this.id);
    }
    unlink_child(id) {
        this.children.delete(id);
    }
    unlink_parent(id) {
        this.parents.delete(id);
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
export class Vitamins {
    vue;
    documents;
    all_queries;
    queries_by_collection;
    constructor(vue) {
        this.vue = vue;
        this.documents = new Map();
        this.queries_by_collection = new Map();
        this.all_queries = new Map();
    }
    query(collection, query_parameters, ...generators) {
        if (!this.queries_by_collection.has(collection.collection_id)) {
            this.queries_by_collection.set(collection.collection_id, new Set());
        }
        let generated_query = new Query(this, collection, query_parameters, generators);
        let query = this._find_existing_query(generated_query) ?? generated_query;
        if (query !== generated_query) {
            for (let generator of generators) {
                if (!query.child_generators.includes(generator)) {
                    query.child_generators.push(generator);
                }
            }
            this._generate_child_queries(query, generators);
        }
        return query;
    }
    _find_existing_query(query) {
        let collection_queries = this.queries_by_collection.get(query.reference.collection_id);
        let existing_query = Query.find_query(Array.from(collection_queries), query);
        return existing_query;
    }
    _add_query(query) {
        if (!this.queries_by_collection.has(query.reference.collection_id)) {
            this.queries_by_collection.set(query.reference.collection_id, new Set());
        }
        let queries = this.queries_by_collection.get(query.reference.collection_id);
        queries.add(query);
        this.all_queries.set(query.id, query);
    }
    _delete_query(query) {
        this.queries_by_collection.get(query.reference.collection_id).delete(query);
        this.all_queries.delete(query.id);
    }
    _add_document(document) {
        this.documents.set(document.document._id, document);
    }
    _update_data(parent_query, reference, document_id, data) {
        let document = this.documents.get(document_id);
        if (!document) {
            document = new Document(this, reference, data);
            this._add_document(document);
        }
        document.document = data;
        parent_query.link_child(document);
        let generated_child_queries = this._generate_child_queries(parent_query);
        let test_queries_for_deletion = Array.from(document.children).map(query_id => this.all_queries.get(query_id));
        console.log(test_queries_for_deletion);
        this._cleanup(test_queries_for_deletion, []);
        generated_child_queries.forEach(ele => ele.run(false));
        let cloned_data = structuredClone(data);
        if (!this.vue[reference.collection_id]) {
            throw new Error(`when updating ${reference.collection_id}, found that the vue app does not have a ${reference.collection_id} key`);
        }
        if (!(this.vue[reference.collection_id] instanceof Map)) {
            throw new Error(`when updating ${reference.collection_id}, found that the vue app key ${reference.collection_id} is not a map. It should be a Map<string, ${reference.collection_id}>`);
        }
        this.vue[reference.collection_id].set(document_id, cloned_data);
    }
    _generate_child_queries(query, generators) {
        let all_generated_child_queries = [];
        for (let document_id of query.children) {
            let document = this.documents.get(document_id);
            let generated_child_queries = (generators ?? query.child_generators).map(generator => generator(document.document));
            for (let q = 0; q < generated_child_queries.length; q++) {
                let generated_child_query = generated_child_queries[q];
                let query = this._find_existing_query(generated_child_query) ?? generated_child_query;
                if (generated_child_query !== query) {
                    generated_child_queries[q] = query;
                }
                else {
                    this._add_query(generated_child_query);
                }
                generated_child_query.link_parent(document);
            }
            all_generated_child_queries.push(...generated_child_queries);
        }
        return all_generated_child_queries;
    }
    _cleanup(queries, documents) {
        let check_queries_queue = queries.slice();
        let check_documents_queue = documents.slice();
        while (check_queries_queue.length > 0 || check_documents_queue.length > 0) {
            while (check_queries_queue.length > 0) {
                let query = check_queries_queue.pop();
                if (query.parents.size > 0) {
                    continue;
                }
                for (let child_id of query.children) {
                    let child = this.documents.get(child_id);
                    check_documents_queue.push(child);
                    child.unlink_parent(query.id);
                }
                this._delete_query(query);
            }
            while (check_documents_queue.length > 0) {
                let document = check_documents_queue.pop();
                if (document.parents.size > 0) {
                    continue;
                }
                for (let child_id of document.children) {
                    let child = this.all_queries.get(child_id);
                    check_queries_queue.push(this.all_queries.get(child_id));
                    child.unlink_parent(document.id);
                }
                this.documents.delete(document.id);
                if (!this.vue[document.reference.collection_id]) {
                    throw new Error(`when updating ${document.reference.collection_id}, found that the vue app does not have a ${document.reference.collection_id} key`);
                }
                ;
                if (!this.vue[document.reference.collection_id] instanceof Map) {
                    throw new Error(`when updating ${document.reference.collection_id}, found that the vue app key ${document.reference.collection_id} is not a map. It should be a Map<string, ${document.reference.collection_id}>`);
                }
                ;
                document.reference.collection_id.delete(document.id);
            }
        }
    }
}
//# sourceMappingURL=vitamins.js.map