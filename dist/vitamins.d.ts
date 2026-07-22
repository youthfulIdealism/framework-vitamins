import { App } from 'vue';
import { generated_collection_interface, generated_document_interface, Infer_Collection_Returntype, result } from './type_generated_collection.js';
type query_operation = "get" | "query";
type child_generator<T extends result> = (result: T) => Query | undefined;
declare class Document {
    id: string;
    vitamins: Vitamins;
    children: Set<string>;
    parents: Set<string>;
    reference: generated_collection_interface<result> | generated_document_interface<result>;
    document: result;
    constructor(vitamins: Vitamins, reference: generated_collection_interface<result> | generated_document_interface<result>, document: result);
    unlink_parent(id: string): void;
}
declare class Query {
    #private;
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
    run_wait?: Promise<boolean>;
    last_result?: result;
    constructor(vitamins: Vitamins, reference: generated_collection_interface<result> | generated_document_interface<result>, argument?: object, child_generators?: child_generator<result>[]);
    rerun(): Promise<void>;
    run(): Promise<{
        query: Query;
        get_results: Query['get_results'];
        rerun: Query['rerun'];
        unlisten: () => void;
    }>;
    run(run_from_root: true): Promise<{
        query: Query;
        get_results: Query['get_results'];
        rerun: Query['rerun'];
        unlisten: () => void;
    }>;
    run(run_from_root: false): Promise<{
        query: Query;
        get_results: Query['get_results'];
        rerun: Query['rerun'];
    }>;
    _fetch(): Promise<never>;
    link_child(document: Document): void;
    link_parent(document: Document): void;
    unlink_child(id: string): void;
    unlink_parent(id: string): void;
    equals(query: Query): boolean;
    clone(): Query;
    next_page(): Promise<{
        query: Query;
        get_results: Query["get_results"];
        rerun: Query["rerun"];
        unlisten: () => void;
    }>;
    get_results<T>(): Promise<T[]>;
    static find_query(queries: Query[], target: Query): Query;
}
export declare class Vitamins {
    vue: App | any;
    documents: Map<string, Document>;
    all_queries: Map<string, Query>;
    queries_by_collection: Map<string, Set<Query>>;
    debug_on: boolean;
    constructor(vue: App | any);
    document<DOC extends generated_document_interface<result>>(document: DOC, ...generators: child_generator<Infer_Collection_Returntype<DOC>>[]): Query;
    query<COL extends generated_collection_interface<result>>(collection: COL, query_parameters: any, ...generators: child_generator<Infer_Collection_Returntype<COL>>[]): Query;
    unlisten_query(query: Query, root_id: string): void;
    add_document_from_external<Document extends generated_document_interface<result>>(collection: Document, data: result): void;
    delete_document_from_external(document_id: string): void;
    update_document_from_external(document_id: string, data: result): void;
    _debug(...print: any[]): void;
    _find_existing_query(query: Query): Query;
    _add_query(query: Query): void;
    _delete_query(query: Query): void;
    _add_document(document: Document): void;
    _update_data(reference: generated_collection_interface<result> | generated_document_interface<result> | undefined, document_id: string, data: result, query?: Query): void;
    _generate_child_queries(document: Document): Query[];
    _cleanup(queries: Query[], documents: Document[]): void;
}
export {};
