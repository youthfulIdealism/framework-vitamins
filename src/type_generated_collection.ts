//import type {Collection} from '@liminalfunctions/framework/'

export type result = { _id: string };
export type generated_collection_interface<T extends result> = {
    path: string[]
    collection_id: string
    collection_name_plural: string

    query: (query: any) => Promise<T[]>;
    document: (document_id: string) => generated_document_interface<T>
}


export type generated_document_interface<T extends result> = {
    path: string[]
    collection_id: string
    collection_name_plural: string
    document_id: string
    get: () => Promise<T>;
}
export type Infer_Collection_Returntype<Type> = Type extends generated_collection_interface<infer E> ? E : never;