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
        vitamins._debug(`constructing query ${reference.collection_id} ${this.id}`);
        this.children = new Set();
        this.parents = new Set();
        this.vitamins = vitamins;
        this.reference = reference;
        this.child_generators = child_generators;
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
        this.has_run = false;
    }
    async rerun() {
        this.vitamins._debug(`RERUNNING QUERY`);
        this.has_run = false;
        await this._fetch();
    }
    async run(run_from_root = true) {
        this.vitamins._debug(`running ${this.reference.collection_id} ${this.id}`);
        let self = this.vitamins._find_existing_query(this) ?? this;
        if (self.id !== this.id) {
            this.vitamins._debug(`replacing self ${this.id} with doppleganger ${self.id}`);
        }
        if (run_from_root && !self.parents.has('root')) {
            self.parents.add('root');
        }
        self.vitamins._add_query(self);
        if (self.id !== this.id) {
            let new_child_generators = this.child_generators.filter(ele => !self.child_generators.includes(ele));
            for (let generator of new_child_generators) {
                self.vitamins._debug(`ADDING CHILD GENERATOR`);
                self.vitamins._debug(generator);
                self.child_generators.push(generator);
            }
            for (let child_id of self.children) {
                let document = self.vitamins.documents.get(child_id);
                let generated_child_queries = self.vitamins._generate_child_queries(document);
                generated_child_queries.forEach(ele => self.vitamins._add_query(ele));
                generated_child_queries.forEach(ele => ele.run());
            }
        }
        else {
            await self._fetch();
        }
        return self;
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
                this.vitamins._update_data(reference, result._id, result, this);
            }
            else if (this.operation === 'query') {
                let reference = this.reference;
                let results = await reference.query(this.query_parameters);
                for (let result of results) {
                    this.vitamins._update_data(reference, result._id, result, this);
                }
            }
        }
        catch (err) {
            return Promise.reject(err);
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
    constructor(vue) {
        this.vue = vue;
        this.documents = new Map();
        this.queries_by_collection = new Map();
        this.all_queries = new Map();
        this.debug_on = false;
    }
    document(collection, ...generators) {
        if (!this.queries_by_collection.has(collection.collection_id)) {
            this.queries_by_collection.set(collection.collection_id, new Set());
        }
        let generated_query = new Query(this, collection, undefined, generators);
        return generated_query;
    }
    query(collection, query_parameters, ...generators) {
        if (!this.queries_by_collection.has(collection.collection_id)) {
            this.queries_by_collection.set(collection.collection_id, new Set());
        }
        let generated_query = new Query(this, collection, query_parameters ?? {}, generators);
        return generated_query;
    }
    delete_document_from_external(document_id) {
        let document = this.documents.get(document_id);
        if (!document) {
            return;
        }
        let parent_queries = Array.from(document.parents).map(ele => this.all_queries.get(ele));
        document.parents.clear();
        let child_queries = Array.from(document.children).map(ele => this.all_queries.get(ele));
        document.children.clear();
        parent_queries.forEach(ele => ele.unlink_child(document_id));
        child_queries.forEach(ele => ele.unlink_parent(document_id));
        this._cleanup([...parent_queries, ...child_queries], [document]);
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
        let collection_queries = this.queries_by_collection.get(query.reference.collection_id);
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
        this.queries_by_collection.get(query.reference.collection_id).delete(query);
        this.all_queries.delete(query.id);
    }
    _add_document(document) {
        this.documents.set(document.document._id, document);
    }
    _update_data(reference, document_id, data, query) {
        let document = this.documents.get(document_id);
        if (!document && reference) {
            document = new Document(this, reference, data);
            this._add_document(document);
        }
        if (!document && !reference) {
            return;
        }
        this._debug(`updating data for a ${document.reference.collection_id} ${document_id}`);
        document.document = data;
        if (query) {
            query.link_child(document);
        }
        let document_previous_children = Array.from(document.children);
        document.children.clear();
        for (let child_query_id of document_previous_children) {
            this.all_queries.get(child_query_id).unlink_parent(document.id);
        }
        let generated_child_queries = this._generate_child_queries(document);
        generated_child_queries.forEach(ele => this._add_query(ele));
        generated_child_queries.forEach(ele => ele.run(false));
        let test_queries_for_deletion = document_previous_children.map(query_id => this.all_queries.get(query_id));
        let bugfind = Array.from(document_previous_children).filter(id => !this.all_queries.has(id));
        if (bugfind.length > 0) {
            this._debug(`BREAKING ID:`);
            this._debug(bugfind);
        }
        this._cleanup(test_queries_for_deletion, []);
        let cloned_data = structuredClone(data);
        if (!this.vue[document.reference.collection_name_plural]) {
            throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app does not have a ${document.reference.collection_name_plural} key`);
        }
        if (!(this.vue[document.reference.collection_name_plural] instanceof Map)) {
            throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app key ${document.reference.collection_name_plural} is not a map. It should be a Map<string, ${document.reference.collection_name_plural}>`);
        }
        this.vue[document.reference.collection_name_plural].set(document_id, cloned_data);
    }
    _generate_child_queries(document) {
        let all_generated_child_queries = [];
        for (let query_parent_id of document.parents) {
            let query_parent = this.all_queries.get(query_parent_id);
            let generated_child_queries = (query_parent.child_generators ?? []).map(generator => generator(document.document)).filter(ele => ele);
            for (let q = 0; q < generated_child_queries.length; q++) {
                let generated_child_query = generated_child_queries[q];
                let query = this._find_existing_query(generated_child_query) ?? generated_child_query;
                if (generated_child_query.id !== query.id) {
                    generated_child_queries[q] = query;
                    generated_child_query = query;
                }
                generated_child_query.link_parent(document);
            }
            all_generated_child_queries.push(...generated_child_queries);
        }
        return Array.from(new Set(all_generated_child_queries));
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
                if (!this.vue[document.reference.collection_name_plural]) {
                    throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app does not have a ${document.reference.collection_name_plural} key`);
                }
                ;
                if (!this.vue[document.reference.collection_name_plural] instanceof Map) {
                    throw new Error(`when updating ${document.reference.collection_name_plural}, found that the vue app key ${document.reference.collection_name_plural} is not a map. It should be a Map<string, ${document.reference.collection_name_plural}>`);
                }
                ;
                this.vue[document.reference.collection_name_plural].delete(document.id);
            }
        }
    }
}
//# sourceMappingURL=vitamins.js.map