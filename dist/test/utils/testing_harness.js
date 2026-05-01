import { v4 as uuid } from 'uuid';
function db_query_mock(db, query) {
    let retval = [];
    for (let db_entry of db.values()) {
        let matches = true;
        for (let [key, value] of Object.entries(query)) {
            if (Array.isArray(db_entry[key])) {
                if (!db_entry[key].includes(value)) {
                    matches = false;
                    break;
                }
            }
            else if (db_entry[key] !== value) {
                matches = false;
                break;
            }
        }
        if (matches) {
            retval.push(db_entry);
        }
    }
    return retval;
}
async function get_query_results(query, database, meta_counter) {
    let results = db_query_mock(database, query);
    for (let result of results) {
        let count = meta_counter.get(result._id) ?? 0;
        meta_counter.set(result._id, count + 1);
    }
    return results;
}
async function get(document_id, database, meta_counter) {
    let count = meta_counter.get(document_id) ?? 0;
    meta_counter.set(document_id, count + 1);
    return database.get(document_id);
}
export function gen_institution(name) {
    return {
        _id: uuid(),
        name: name
    };
}
export function gen_client(institution, name) {
    return {
        _id: uuid(),
        institution_id: institution._id,
        name: name
    };
}
export function gen_project(institution, client, name) {
    return {
        _id: uuid(),
        institution_id: institution._id,
        client_id: client._id,
        name: name
    };
}
export function gen_mutualism(institution, clients, name) {
    return {
        _id: uuid(),
        institution_id: institution._id,
        client_ids: clients.map(ele => ele._id),
        name: name
    };
}
export class Institution {
    path;
    collection_id;
    collection_name_plural;
    database;
    meta_counter;
    errors;
    project;
    client;
    constructor(path, project_database, client, project) {
        this.path = path;
        this.collection_id = 'institution';
        this.collection_name_plural = 'institutions';
        this.database = project_database;
        this.meta_counter = new Map();
        this.project = project;
        this.client = client;
        this.errors = false;
    }
    async query(query) {
        if (this.errors) {
            throw new Error('arbitrary error');
        }
        ;
        return await get_query_results(query, this.database, this.meta_counter);
    }
    document(document_id) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            collection_name_plural: self.collection_name_plural,
            document_id: document_id,
            async get() {
                if (self.errors) {
                    throw new Error('arbitrary error');
                }
                ;
                return await get(document_id, self.database, self.meta_counter);
            },
            collection(collection_id) {
                switch (collection_id) {
                    case 'client':
                        return self.client;
                    case 'project':
                        return self.project;
                }
            }
        };
    }
}
export class Client {
    path;
    collection_id;
    collection_name_plural;
    database;
    meta_counter;
    errors;
    mutualism;
    constructor(path, client_database, mutualism) {
        this.path = path;
        this.collection_id = 'client';
        this.collection_name_plural = 'clients';
        this.database = client_database;
        this.meta_counter = new Map();
        this.mutualism = mutualism;
        this.errors = false;
    }
    async query(query) {
        if (this.errors) {
            throw new Error('arbitrary error');
        }
        ;
        return await get_query_results(query, this.database, this.meta_counter);
    }
    document(document_id) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            collection_name_plural: self.collection_name_plural,
            document_id: document_id,
            async get() {
                if (self.errors) {
                    throw new Error('arbitrary error');
                }
                ;
                return await get(document_id, self.database, self.meta_counter);
            },
            collection(collection_id) {
                switch (collection_id) {
                    case 'mutualism':
                        return self.mutualism;
                }
            }
        };
    }
}
export class Project {
    path;
    collection_id;
    collection_name_plural;
    database;
    meta_counter;
    errors;
    constructor(path, project_database) {
        this.path = path;
        this.collection_id = 'project';
        this.collection_name_plural = 'projects';
        this.database = project_database;
        this.meta_counter = new Map();
        this.errors = false;
    }
    async query(query) {
        if (this.errors) {
            throw new Error('arbitrary error');
        }
        ;
        return await get_query_results(query, this.database, this.meta_counter);
    }
    document(document_id) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            collection_name_plural: self.collection_name_plural,
            document_id: document_id,
            async get() {
                if (self.errors) {
                    throw new Error('arbitrary error');
                }
                ;
                return await get(document_id, self.database, self.meta_counter);
            },
            collection() { }
        };
    }
}
export class Mutualism {
    path;
    collection_id;
    collection_name_plural;
    database;
    meta_counter;
    errors;
    constructor(path, mutualism_database) {
        this.path = path;
        this.collection_id = 'mutualism';
        this.collection_name_plural = 'mutualisms';
        this.database = mutualism_database;
        this.meta_counter = new Map();
        this.errors = false;
    }
    async query(query) {
        if (this.errors) {
            throw new Error('arbitrary error');
        }
        ;
        return await get_query_results(query, this.database, this.meta_counter);
    }
    document(document_id) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            collection_name_plural: self.collection_name_plural,
            document_id: document_id,
            async get() {
                if (self.errors) {
                    throw new Error('arbitrary error');
                }
                ;
                return await get(document_id, self.database, self.meta_counter);
            },
            collection() { }
        };
    }
}
//# sourceMappingURL=testing_harness.js.map