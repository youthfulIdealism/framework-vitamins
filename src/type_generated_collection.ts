//import type {Collection} from '@liminalfunctions/framework/'

export type result = { _id: string };
// Q is the type of the collection's query parameters
export type generated_collection_interface<T extends result, Q = any> = {
    path: string[]
    collection_id: string
    collection_name_plural: string

    query: (query: Q) => Promise<T[]>;
    document: (document_id: string) => generated_document_interface<T>
}


export type generated_document_interface<T extends result> = {
    path: string[]
    collection_id: string
    collection_name_plural: string
    document_id: string
    get: () => Promise<T>;
}
export type Infer_Collection_Returntype<Type> = Type extends generated_collection_interface<infer E>
    ? E
    : Type extends generated_document_interface<infer E>
        ? E
        : never;

// the query parameters a collection's query method takes
export type Infer_Query_Parameters<Type> = Type extends { query: (query: infer Q) => any }
    ? Q
    : never;