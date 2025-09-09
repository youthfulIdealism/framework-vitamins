import { App } from 'vue';
import { generated_collection, result } from './type_generated_collection.js';
type query_operation = "get" | "query";
type generator_arguments = [generated_collection, query_operation, string | any, ...child_generator[]];
type child_generator = (result: result) => generator_arguments[];
declare class Document {
    id: string;
    vitamins: Vitamins;
    children: Query[];
    parents: Query[];
    collection: generated_collection;
    document: result;
    constructor(vitamins: Vitamins, collection: generated_collection, document: result);
    unlink_parent(query: Query): void;
}
declare class Query {
    vitamins: Vitamins;
    children: Document[];
    parents: (Document | string)[];
    collection: generated_collection;
    collection_path: string;
    operation: query_operation;
    id?: string;
    query_parameters?: any;
    child_generators: child_generator[];
    has_run: boolean;
    constructor(vitamins: Vitamins, collection: generated_collection, operation: query_operation, argument: string | any, child_generators?: child_generator[]);
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
    get(collection: generated_collection, id: string, ...generators: child_generator[]): Promise<void>;
    query(collection: generated_collection, query_parameters: any, ...generators: child_generator[]): Promise<void>;
    add_query(query: Query, force?: boolean): void;
    add_document(document: Document): void;
    update_data(parent_query: Query, collection: generated_collection, document_id: string, data: result): void;
    cleanup(queries: Query[], documents: Document[]): void;
}
export {};
