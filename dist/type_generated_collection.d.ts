export type result = {
    _id: string;
};
export type generated_collection_interface = {
    path: string[];
    collection_id: string;
    query: (query: any) => Promise<result[]>;
    document: (document_id: string) => generated_document_interface;
};
export type generated_document_interface = {
    path: string[];
    collection_id: string;
    get: () => Promise<result>;
};
