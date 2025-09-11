import { App } from 'vue';
import { generated_collection_interface, generated_document_interface, result } from './type_generated_collection.js';
type query_operation = "get" | "query";
type child_generator = (result: result) => Query;
declare class Document {
    id: string;
    vitamins: Vitamins;
    children: Query[];
    parents: Query[];
    reference: generated_collection_interface | generated_document_interface;
    document: result;
    constructor(vitamins: Vitamins, reference: generated_collection_interface | generated_document_interface, document: result);
    unlink_parent(query: Query): void;
}
declare class Query {
    id: string;
    vitamins: Vitamins;
    children: Document[];
    parents: (Document | string)[];
    reference: generated_collection_interface | generated_document_interface;
    collection_path: string;
    operation: query_operation;
    document_id?: string;
    query_parameters?: any;
    child_generators: child_generator[];
    has_run: boolean;
    constructor(vitamins: Vitamins, reference: generated_collection_interface | generated_document_interface, argument?: object, child_generators?: child_generator[]);
    rerun(): Promise<void>;
    run(run_from_root?: boolean): Promise<this>;
    _fetch(): Promise<void>;
    link_child(document: Document): void;
    link_parent(document: Document): void;
    unlink_child(document: Document): void;
    unlink_parent(document: Document): void;
    equals(query: Query): boolean;
    static find_query(queries: Query[], target: Query): Query;
}
export declare class Vitamins {
    vue: App;
    documents: Map<string, Document>;
    queries: Map<string, Query[]>;
    constructor(vue: App);
    query(collection: generated_collection_interface, query_parameters: any, ...generators: child_generator[]): Query;
    _add_query(query: Query, force?: boolean): void;
    _add_document(document: Document): void;
    _update_data(parent_query: Query, reference: generated_collection_interface | generated_document_interface, document_id: string, data: result): void;
    _generate_child_queries(query: Query, generators?: child_generator[]): Query[];
    _cleanup(queries: Query[], documents: Document[]): void;
}
export {};
