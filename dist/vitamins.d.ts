import { App } from 'vue';
import { generated_collection_interface, generated_document_interface, result } from './type_generated_collection.js';
type query_operation = "get" | "query";
type generator_arguments = [generated_collection_interface | generated_document_interface, string | any, ...child_generator[]];
type child_generator = (result: result) => generator_arguments;
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
    constructor(vitamins: Vitamins, reference: generated_collection_interface | generated_document_interface, argument: string | any, child_generators?: child_generator[]);
    run(): Promise<void>;
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
    get(collection: generated_collection_interface, id: string, ...generators: child_generator[]): Promise<void>;
    query(collection: generated_collection_interface, query_parameters: any, ...generators: child_generator[]): Promise<void>;
    add_query(query: Query, force?: boolean): void;
    add_document(document: Document): void;
    update_data(parent_query: Query, reference: generated_collection_interface | generated_document_interface, document_id: string, data: result): void;
    cleanup(queries: Query[], documents: Document[]): void;
}
export {};
