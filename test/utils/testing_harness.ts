import { v4 as uuid } from 'uuid'

import { generated_collection_interface, result } from '../../dist/type_generated_collection'

function db_query_mock(db: Map<string, any>, query: object){
    let retval: any[] = [];
    for(let db_entry of db.values()) {
        let matches = true;
        for(let [key, value] of Object.entries(query)){
            if(Array.isArray(db_entry[key])) { 
                if(!db_entry[key].includes(value)) { matches = false; break; }
            }
            else if(db_entry[key] !== value) { matches = false; break; }
        }

        if(matches){
            retval.push(db_entry);
        }
    }
    return retval;
}

async function get_query_results<T>(query: any, database: Map<string, T>, meta_counter: Map<string, any>): Promise<T[]> {
    let results = db_query_mock(database, query);
    for(let result of results){
        let count = meta_counter.get(result._id) ?? 0;
        meta_counter.set(result._id, count + 1);
    }
    return results;
}

async function get<T>(document_id: string, database: Map<string, T>, meta_counter: Map<string, any>): Promise<T | undefined> {
    let count = meta_counter.get(document_id) ?? 0;
    meta_counter.set(document_id, count + 1);
    return database.get(document_id);
}

type institution_result = {
    _id: string,
    name: string
}

type client_result = {
    _id: string,
    institution_id: string
    name: string
}

type project_result = {
    _id: string,
    institution_id: string
    client_id: string
    name: string
}

type mutualism_result = {
    _id: string,
    institution_id: string
    client_ids: string[]
    name: string
}

export function gen_institution(name: string): institution_result{
    return {
        _id: uuid(),
        name: name
    }
}

export function gen_client(institution: result, name: string): client_result {
    return {
        _id: uuid(),
        institution_id: institution._id,
        name: name
    }
}

export function gen_project(institution: result, client: result, name: string): project_result {
    return {
        _id: uuid(),
        institution_id: institution._id,
        client_id: client._id,
        name: name
    }
}

export function gen_mutualism(institution: result, clients: result[], name: string): mutualism_result {
    return {
        _id: uuid(),
        institution_id: institution._id,
        client_ids: clients.map(ele => ele._id),
        name: name
    }
}

export class Institution {
    path: string[]
    collection_id: string;
    collection_name_plural: string
    database: Map<string, any>
    meta_counter: Map<string, any>
    errors: boolean

    project: Project
    client: Client
    

    constructor(path: string[], project_database: Map<string, any>, client: Client, project: Project) {
        this.path = path;
        this.collection_id = 'institution';
        this.collection_name_plural = 'institutions'
        this.database = project_database;
        this.meta_counter = new Map();
        this.project = project;
        this.client = client;
        this.errors = false;
    }

    async query(query: any): Promise<institution_result[]> {
        if(this.errors){ throw new Error('arbitrary error')};
        return await get_query_results(query, this.database, this.meta_counter);
    }

    document(document_id: string) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            collection_name_plural: self.collection_name_plural,
            document_id: document_id,
            async get(): Promise<institution_result>{
                if(self.errors){ throw new Error('arbitrary error')};
                return await get(document_id, self.database, self.meta_counter)
            },
            collection(collection_id: 'client' | 'project') {
                switch(collection_id){
                    case 'client':
                        return self.client;
                    case 'project':
                        return self.project;
                }
            }
        }
    }
}

export class Client {
    path: string[]
    collection_id: string;
    collection_name_plural: string;
    database: Map<string, any>
    meta_counter: Map<string, any>
    errors: boolean

    mutualism: Mutualism

    constructor(path: string[], client_database: Map<string, any>, mutualism: Mutualism) {
        this.path = path;
        this.collection_id = 'client';
        this.collection_name_plural = 'clients';
        this.database = client_database;
        this.meta_counter = new Map();
        this.mutualism = mutualism;
        this.errors = false;
    }

    async query(query: any): Promise<client_result[]> {
        if(this.errors){ throw new Error('arbitrary error')};
        return await get_query_results(query, this.database, this.meta_counter);
    }

    document(document_id: string) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            collection_name_plural: self.collection_name_plural,
            document_id: document_id,
            async get(): Promise<client_result> {
                if(self.errors){ throw new Error('arbitrary error')};
                return await get(document_id, self.database, self.meta_counter)
            },
            collection(collection_id: 'mutualism'): Mutualism {
                switch(collection_id){
                    case 'mutualism':
                        return self.mutualism;
                }
            }
        }
    }
}

export class Project {
    path: string[]
    collection_id: string;
    collection_name_plural: string
    database: Map<string, any>
    meta_counter: Map<string, any>
    errors: boolean

    constructor(path: string[], project_database: Map<string, any>) {
        this.path = path;
        this.collection_id = 'project';
        this.collection_name_plural = 'projects'
        this.database = project_database;
        this.meta_counter = new Map();
        this.errors = false;
    }

    async query(query: any): Promise<project_result[]> {
        if(this.errors){ throw new Error('arbitrary error')};
        return await get_query_results(query, this.database, this.meta_counter);
    }

    document(document_id: string) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            collection_name_plural: self.collection_name_plural,
            document_id: document_id,
            async get(): Promise<project_result> {
                if(self.errors){ throw new Error('arbitrary error')};
                return await get(document_id, self.database, self.meta_counter)
            },
            collection() {}
        }
    }
}

export class Mutualism {
    path: string[]
    collection_id: string;
    collection_name_plural: string
    database: Map<string, any>
    meta_counter: Map<string, any>
    errors: boolean

    constructor(path: string[], mutualism_database: Map<string, any>) {
        this.path = path;
        this.collection_id = 'mutualism';
        this.collection_name_plural = 'mutualisms'
        this.database = mutualism_database;
        this.meta_counter = new Map();
        this.errors = false;
    }

    async query(query: any): Promise<mutualism_result[]> {
        if(this.errors){ throw new Error('arbitrary error')};
        return await get_query_results(query, this.database, this.meta_counter);
    }

    document(document_id: string) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            collection_name_plural: self.collection_name_plural,
            document_id: document_id,
            async get(): Promise<mutualism_result> {
                if(self.errors){ throw new Error('arbitrary error')};
                return await get(document_id, self.database, self.meta_counter)
            },
            collection() {}
        }
    }
}