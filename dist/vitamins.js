class Document {
    id;
    vitamins;
    children;
    parents;
    collection;
    document;
    constructor(vitamins, collection, document) {
        this.vitamins = vitamins;
        this.children = [];
        this.parents = [];
        this.collection = collection;
        this.document = document;
        this.id = document._id;
    }
    unlink_parent(query) {
        for (let q = 0; q < this.parents.length; q++) {
            if (typeof this.parents[q] === 'string') {
                continue;
            }
            if (this.parents[q].equals(query)) {
                this.parents.splice(q, 1);
                break;
            }
        }
    }
}
class Query {
    vitamins;
    children;
    parents;
    collection;
    collection_path;
    operation;
    id;
    query_parameters;
    child_generators;
    has_run;
    constructor(vitamins, collection, operation, argument, child_generators = []) {
        this.children = [];
        this.parents = [];
        this.vitamins = vitamins;
        this.collection = collection;
        this.operation = operation;
        this.child_generators = child_generators;
        if (operation === 'get') {
            this.id = argument;
            this.collection_path = [...this.collection.path, this.id].join('/');
        }
        else if (operation === 'query') {
            this.query_parameters = argument;
            this.collection_path = this.collection.path.join('/');
        }
        this.has_run = false;
    }
    async run() {
        if (this.has_run) {
            return;
        }
        this.has_run = true;
        console.log(`running ${this.collection.collection_id}`);
        try {
            if (this.operation === 'get') {
                let result = await this.collection.document(this.id).get();
                this.vitamins.update_data(this, this.collection, result._id, result);
            }
            else if (this.operation === 'query') {
                let results = await this.collection.query(this.query_parameters);
                for (let result of results) {
                    this.vitamins.update_data(this, this.collection, result._id, result);
                }
            }
        }
        catch (err) {
            console.error(err);
            throw err;
        }
    }
    link_child(document) {
        let has_child_already = false;
        for (let child of this.children) {
            if (child.id === document.id) {
                has_child_already = true;
                break;
            }
        }
        if (!has_child_already) {
            this.children.push(document);
        }
        let document_has_parent = false;
        for (let query of document.parents) {
            if (query.equals(this)) {
                document_has_parent = true;
                break;
            }
        }
        if (!document_has_parent) {
            document.parents.push(this);
        }
    }
    link_parent(document) {
        let has_parent_already = false;
        for (let parent of this.parents) {
            if (typeof parent === 'string') {
                continue;
            }
            if (parent.id === document.id) {
                has_parent_already = true;
                break;
            }
        }
        if (!has_parent_already) {
            this.parents.push(document);
        }
        let document_has_child = false;
        for (let query of document.children) {
            if (query.equals(this)) {
                document_has_child = true;
                break;
            }
        }
        if (!document_has_child) {
            document.children.push(this);
        }
    }
    unlink_child(document) {
        for (let q = 0; q < this.children.length; q++) {
            if (this.children[q].id === document.id) {
                this.children.splice(q, 1);
                break;
            }
        }
    }
    unlink_parent(document) {
        for (let q = 0; q < this.parents.length; q++) {
            if (typeof this.parents[q] === 'string') {
                continue;
            }
            if (this.parents[q].id === document.id) {
                this.parents.splice(q, 1);
                break;
            }
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
        if (query.id !== this.id) {
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
    queries;
    constructor(vue) {
        this.vue = vue;
        this.documents = new Map();
        this.queries = new Map();
    }
    async get(collection, id, ...generators) {
        if (!this.queries.has(collection.collection_id)) {
            this.queries.set(collection.collection_id, []);
        }
        let collection_queries = this.queries.get(collection.collection_id);
        let query = new Query(this, collection, 'get', id, generators);
        let existing_query = Query.find_query(collection_queries, query);
        if (existing_query) {
            query = existing_query;
        }
        query.parents.push('root');
        await query.run();
    }
    async query(collection, query_parameters, ...generators) {
        let query = new Query(this, collection, 'query', query_parameters, generators);
        query.parents.push('root');
        await query.run();
    }
    add_query(query, force = false) {
        if (!this.queries.has(query.collection.collection_id)) {
            this.queries.set(query.collection.collection_id, []);
        }
        let queries = this.queries.get(query.collection.collection_id);
        if (force || !Query.find_query(queries, query)) {
            queries.push(query);
        }
    }
    add_document(document) {
        if (!this.documents.get(document.document._id)) {
            this.documents.set(document.document._id, document);
        }
    }
    update_data(parent_query, collection, document_id, data) {
        let document = this.documents.get(document_id);
        if (!document) {
            document = new Document(this, collection, data);
            this.add_document(document);
        }
        document.document = data;
        parent_query.link_child(document);
        let all_parent_queries = document.parents;
        let generated_child_queries = all_parent_queries.flatMap(ele => ele.child_generators).flatMap(ele => ele(data)).map(ele => new Query(this, ele[0], ele[1], ele[2], ele.slice(3)));
        let test_queries_for_deletion = document.children;
        for (let q = 0; q < generated_child_queries.length; q++) {
            let generated_child_query = generated_child_queries[q];
            let collection_query_list = this.queries.get(generated_child_query.collection.collection_id) ?? [];
            let existing_query = Query.find_query(collection_query_list, generated_child_query);
            if (existing_query) {
                generated_child_queries[q] = existing_query;
            }
            else {
                this.add_query(generated_child_query, true);
            }
        }
        for (let parent_query of document.parents) {
            parent_query.unlink_child(document);
        }
        document.parents = generated_child_queries;
        for (let child_query of generated_child_queries) {
            child_query.link_parent(document);
        }
        this.cleanup(test_queries_for_deletion, []);
        generated_child_queries.forEach(ele => ele.run());
        let cloned_data = structuredClone(data);
        if (!this.vue[collection.collection_id]) {
            throw new Error(`when updating ${collection.collection_id}, found that the vue app does not have a ${collection.collection_id} key`);
        }
        if (!(this.vue[collection.collection_id] instanceof Map)) {
            throw new Error(`when updating ${collection.collection_id}, found that the vue app key ${collection.collection_id} is not a map. It should be a Map<string, ${collection.collection_id}>`);
        }
        this.vue[collection.collection_id].set(document_id, cloned_data);
    }
    cleanup(queries, documents) {
        let check_queries_queue = queries.slice();
        let check_documents_queue = documents.slice();
        while (check_queries_queue.length > 0 || check_documents_queue.length > 0) {
            while (check_queries_queue.length > 0) {
                let query = check_queries_queue.pop();
                if (query.parents.length > 0) {
                    continue;
                }
                for (let child of query.children) {
                    check_documents_queue.push(child);
                    child.unlink_parent(query);
                }
                let query_list = this.queries.get(query.collection.collection_id);
                for (let q = 0; q < query_list.length; q++) {
                    if (query_list[q].equals(query)) {
                        query_list.splice(q, 1);
                        break;
                    }
                }
            }
            while (check_documents_queue.length > 0) {
                let document = check_documents_queue.pop();
                if (document.parents.length > 0) {
                    continue;
                }
                for (let child of document.children) {
                    check_queries_queue.push(child);
                    child.unlink_parent(document);
                }
                this.documents.delete(document.id);
                if (!this.vue[document.collection.collection_id]) {
                    throw new Error(`when updating ${document.collection.collection_id}, found that the vue app does not have a ${document.collection.collection_id} key`);
                }
                ;
                if (!this.vue[document.collection.collection_id] instanceof Map) {
                    throw new Error(`when updating ${document.collection.collection_id}, found that the vue app key ${document.collection.collection_id} is not a map. It should be a Map<string, ${document.collection.collection_id}>`);
                }
                ;
                document.collection.collection_id.delete(document.id);
            }
        }
    }
}
//# sourceMappingURL=vitamins.js.map