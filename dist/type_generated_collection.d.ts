export type result = {
    _id: string;
};
export type generated_collection = {
    path: string[];
    collection_id: string;
    query: (query: any) => Promise<result[]>;
    document: (document_id: string) => {
        get: () => Promise<result>;
    };
};
