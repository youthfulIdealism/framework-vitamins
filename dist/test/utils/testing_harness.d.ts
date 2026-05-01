import { result } from '../../dist/type_generated_collection.js';
type institution_result = {
    _id: string;
    name: string;
};
type client_result = {
    _id: string;
    institution_id: string;
    name: string;
};
type project_result = {
    _id: string;
    institution_id: string;
    client_id: string;
    name: string;
};
type mutualism_result = {
    _id: string;
    institution_id: string;
    client_ids: string[];
    name: string;
};
export declare function gen_institution(name: string): institution_result;
export declare function gen_client(institution: result, name: string): client_result;
export declare function gen_project(institution: result, client: result, name: string): project_result;
export declare function gen_mutualism(institution: result, clients: result[], name: string): mutualism_result;
export declare class Institution {
    path: string[];
    collection_id: string;
    collection_name_plural: string;
    database: Map<string, any>;
    meta_counter: Map<string, any>;
    errors: boolean;
    project: Project;
    client: Client;
    constructor(path: string[], project_database: Map<string, any>, client: Client, project: Project);
    query(query: any): Promise<institution_result[]>;
    document(document_id: string): {
        path: string[];
        collection_id: string;
        collection_name_plural: string;
        document_id: string;
        get(): Promise<institution_result>;
        collection(collection_id: "client" | "project"): Project | Client;
    };
}
export declare class Client {
    path: string[];
    collection_id: string;
    collection_name_plural: string;
    database: Map<string, any>;
    meta_counter: Map<string, any>;
    errors: boolean;
    mutualism: Mutualism;
    constructor(path: string[], client_database: Map<string, any>, mutualism: Mutualism);
    query(query: any): Promise<client_result[]>;
    document(document_id: string): {
        path: string[];
        collection_id: string;
        collection_name_plural: string;
        document_id: string;
        get(): Promise<client_result>;
        collection(collection_id: "mutualism"): Mutualism;
    };
}
export declare class Project {
    path: string[];
    collection_id: string;
    collection_name_plural: string;
    database: Map<string, any>;
    meta_counter: Map<string, any>;
    errors: boolean;
    constructor(path: string[], project_database: Map<string, any>);
    query(query: any): Promise<project_result[]>;
    document(document_id: string): {
        path: string[];
        collection_id: string;
        collection_name_plural: string;
        document_id: string;
        get(): Promise<project_result>;
        collection(): void;
    };
}
export declare class Mutualism {
    path: string[];
    collection_id: string;
    collection_name_plural: string;
    database: Map<string, any>;
    meta_counter: Map<string, any>;
    errors: boolean;
    constructor(path: string[], mutualism_database: Map<string, any>);
    query(query: any): Promise<mutualism_result[]>;
    document(document_id: string): {
        path: string[];
        collection_id: string;
        collection_name_plural: string;
        document_id: string;
        get(): Promise<mutualism_result>;
        collection(): void;
    };
}
export {};
