import { App } from 'vue';
import { generated_collection_interface, generated_document_interface, Infer_Collection_Returntype, Infer_Query_Parameters, result } from './type_generated_collection.js';
type query_operation = "get" | "query";
type query_reference = generated_collection_interface<result> | generated_document_interface<result>;
type child_generator<T extends result> = (result: T) => QuerySpec | undefined;
declare class Document {
    id: string;
    vitamins: Vitamins;
    parents: Set<Query>;
    links: Map<Generator, Link>;
    reference: generated_collection_interface<result> | generated_document_interface<result>;
    document: result;
    constructor(vitamins: Vitamins, reference: generated_document_interface<result>, document: result);
}
declare class Generator {
    parent_query: Query;
    generator_function: child_generator<result>;
    sources: Set<Link>;
    links: Set<Link>;
    constructor(parent_query: Query, generator_function: child_generator<result>);
}
declare class Link {
    document?: Document;
    generator?: Generator;
    query?: Query;
    contributed: Set<Generator>;
    constructor(document?: Document, generator?: Generator);
}
declare class QueryShape {
    reference: query_reference;
    collection_path: string;
    operation: query_operation;
    document_id?: string;
    query_parameters?: any;
    constructor(reference: query_reference, argument?: object);
    equals(query: QueryShape): boolean;
}
declare class QuerySpec extends QueryShape {
    vitamins: Vitamins;
    child_generators: child_generator<result>[];
    constructor(vitamins: Vitamins, reference: query_reference, argument?: object, child_generators?: child_generator<result>[]);
    run(): Promise<{
        query: Query;
        get_results: Query['get_results'];
        rerun: Query['rerun'];
        unlisten: () => void;
    }>;
}
declare class Query extends QueryShape {
    #private;
    id: string;
    vitamins: Vitamins;
    documents: Set<Document>;
    parents: Set<Link>;
    generators: Map<child_generator<result>, Generator>;
    external_root?: Link;
    has_run: boolean;
    run_wait?: Promise<boolean>;
    last_result?: result;
    constructor(vitamins: Vitamins, shape: QueryShape);
    rerun(): Promise<void>;
    _fetch(): Promise<never>;
    clone(): QuerySpec;
    next_page(): Promise<{
        query: Query;
        get_results: Query["get_results"];
        rerun: Query["rerun"];
        unlisten: () => void;
    }>;
    get_results<T>(): Promise<T[]>;
    static find_query(queries: Query[], target: QueryShape): Query;
}
export declare class Vitamins {
    vue: App | any;
    documents: Map<string, Document>;
    all_queries: Map<string, Query>;
    queries_by_collection: Map<string, Set<Query>>;
    debug_on: boolean;
    roots: Set<Link>;
    _garbage_possible: boolean;
    _garbage_collection_scheduled: boolean;
    constructor(vue: App | any);
    document<DOC extends generated_document_interface<result>>(document: DOC, ...generators: child_generator<Infer_Collection_Returntype<DOC>>[]): QuerySpec;
    query<COL extends generated_collection_interface<result>>(collection: COL, query_parameters: Infer_Query_Parameters<COL>, ...generators: child_generator<Infer_Collection_Returntype<COL>>[]): QuerySpec;
    unlisten_query(root: Link): void;
    add_document_from_external<Document extends generated_document_interface<result>>(collection: Document, data: result): void;
    delete_document_from_external(document_id: string): void;
    collect_garbage(): void;
    update_document_from_external(document_id: string, data: result): void;
    _debug(...print: any[]): void;
    _find_existing_query(query: QueryShape): Query;
    _add_query(query: Query): void;
    _delete_query(query: Query): void;
    _add_document(document: Document): void;
    _resolve_query(query_spec: QuerySpec, link: Link, loop_detector?: ReadonlySet<Query>): {
        query: Query;
        fetch?: Promise<void>;
    };
    _set_generators_contributed_by_link(link: Link, generator_functions: child_generator<result>[]): Generator[];
    _run_generator(document: Document, generator: Generator, rewalking?: ReadonlySet<Query>): Link;
    _remove_link(link: Link): void;
    _update_data(reference: generated_collection_interface<result> | generated_document_interface<result> | undefined, document_id: string, data: result, query?: Query, collect_garbage?: boolean): void;
    _schedule_garbage_collection(): void;
    _collect_garbage(): void;
}
export {};
