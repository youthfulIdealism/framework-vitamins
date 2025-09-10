import assert from "assert";

import { generated_collection_interface, result } from '../dist/type_generated_collection'
import { Vitamins } from '../dist/vitamins'
import { v4 as uuid } from 'uuid'

function db_query_mock(db: Map<string, any>, query: object){
    let retval: any[] = [];
    for(let db_entry of db.values()) {
        let matches = true;
        for(let [key, value] of Object.entries(query)){
            if(Array.isArray(db_entry[key])) { 
                if(!db_entry[key].includes(value)) { matches = false; break; }
            }
            else if(db_entry[key] !== value) { matches = false; break; }
        }

        if(matches){
            retval.push(db_entry);
        }
    }
    return retval;
}

class Collection {
    path: string[]
    collection_id: string;
    database: Map<string, any>
    children: {[key: string]: Collection}
    meta_counter: Map<string, any>

    constructor(path: string[], collection_id: string, database: Map<string, any>, children: {[key: string]: Collection}) {
        this.path = path;
        this.collection_id = collection_id;
        this.database = database;
        this.children = children;
        this.meta_counter = new Map();
    }

    async query(query: any): Promise<result[]> {
        let results = db_query_mock(this.database, query);
        for(let result of results){
            let count = this.meta_counter.get(result._id) ?? 0;
            this.meta_counter.set(result._id, count + 1);
        }
        return results;
    }

    document(document_id: string) {
        let self = this;
        return {
            path: [...self.path, document_id],
            collection_id: self.collection_id,
            async get(): Promise<result>{
                let count = self.meta_counter.get(document_id) ?? 0;
                self.meta_counter.set(document_id, count + 1);
                return self.database.get(document_id);
            },
            collection(collection_id: string) {
                return self.children[collection_id];
            }
        }
    }
}


describe('Client Library Generation: Library Generation', function () { 
    
    function get_setup(
        institution_database: Map<string, any> = new Map<string, any>(),
        client_database: Map<string, any> = new Map<string, any>(),
        project_database: Map<string, any> = new Map<string, any>(),
        mutualsm_database: Map<string, any> = new Map<string, any>()
    ) {

        let collection_mutualism = new Collection(
            ['institution', 'client', 'mutualism'],
            'mutualism',
            mutualsm_database,
            {}
        )

        let collection_project = new Collection(
            ['institution', 'project'],
            'project',
            project_database,
            {}
        )

        let collection_client = new Collection(
            ['institution', 'client'],
            'client',
            client_database,
            {
                'mutualism': collection_mutualism
            }
        )

        let collection_institution = new Collection(
            ['institution'],
            'institution',
            institution_database,
            {
                'client': collection_client,
                'project': collection_project
            }
        )

        let api = {
            collection(collection_id: string){
                if(collection_id === 'institution'){ return collection_institution; }
            }
        }

        let vue = gen_vue();

        return {
            collection_mutualism,
            collection_project,
            collection_client,
            collection_institution,
            api,
            vue
        }
    }

    function gen_vue() {
        return {
            institution: new Map<string, any>(),
            client: new Map<string, any>(),
            project: new Map<string, any>(),
            mutualism: new Map<string, any>(),
        }
    }

    function gen_institution(name: string){
        return {
            _id: uuid(),
            name: name
        }
    }

    function gen_client(institution: result, name: string) {
        return {
            _id: uuid(),
            institution_id: institution._id,
            name: name
        }
    }

    function gen_project(institution: result, client: result, name: string) {
        return {
            _id: uuid(),
            institution_id: institution._id,
            client_id: client._id,
            name: name
        }
    }

    function gen_mutualism(institution: result, clients: result[], name: string) {
        return {
            _id: uuid(),
            institution_id: institution._id,
            client_ids: clients.map(ele => ele._id),
            name: name
        }
    }

    function database(...entries: result[]){
        let map = new Map<string, any>();
        for(let entry of entries){
            map.set(entry._id, entry);
        }
        return map;
    }

    function sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    function print_vitamins(vitamins: Vitamins) {
        console.log(`documents:`)
        for(let document of vitamins.documents.values()) {
            console.log(`${document.reference.collection_id} ${document.id}`)
            for(let child of document.children) {
                if(!child.id){ child.id = uuid(); }
                console.log(`\t${child.id}`);
            }
        }
        console.log('')
        console.log(`queries:`)

        for(let [key, queries] of vitamins.queries.entries()) {
            console.log('')
            console.log(`${key}:`)
            for(let [key, value] of queries.entries()) {
                console.log(`${value.id}:`)
                for(let child of value.children) {
                    console.log(`\t${child.id}`);
                }
            }
        }
    }

    it(`should do a basic query`, async function () {
        let institution = gen_institution('test institution')
        let institution_database = database(institution);
        let {
            vue,
            api
        } = get_setup(institution_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        vitamins.query(api.collection('institution') as Collection, {})
        await sleep(100);

        let test_against = gen_vue();
        test_against.institution.set(institution._id, structuredClone(institution));

        assert.deepEqual(vue.institution.get(institution._id), institution)
        assert.deepEqual(vue, test_against)
    });

    it(`should do a basic query that returns multiple children`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let institution_2 = gen_institution('test institution 2')
        let institution_3 = gen_institution('test institution 3')
        let institution_database = database(institution_1, institution_2, institution_3);
        let {
            vue,
            api
        } = get_setup(institution_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        vitamins.query(api.collection('institution') as Collection, {})
        await sleep(100);

        let test_against = gen_vue();
        test_against.institution.set(institution_1._id, structuredClone(institution_1));
        test_against.institution.set(institution_2._id, structuredClone(institution_2));
        test_against.institution.set(institution_3._id, structuredClone(institution_3));

        assert.deepEqual(vue.institution.get(institution_3._id), institution_3)
        assert.deepEqual(vue, test_against)
    });

    it(`should do a basic query that generates a child query`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let client_1 = gen_client(institution_1, 'test client 1')
        let institution_database = database(institution_1);
        let client_database = database(client_1);
        let {
            vue,
            api
        } = get_setup(institution_database, client_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        vitamins.query(api.collection('institution') as Collection, {},
            (result: result) => [api.collection('institution')?.document(result._id).collection('client') as generated_collection_interface, {}]
        )
        await sleep(100);

        let test_against = gen_vue();
        test_against.institution.set(institution_1._id, structuredClone(institution_1));
        test_against.client.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.institution.get(institution_1._id), institution_1)
        assert.deepEqual(vue.client.get(client_1._id), client_1)
        assert.deepEqual(vue, test_against)
    });

    it(`should do a basic query that generates a child query that generates a child query`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let client_1 = gen_client(institution_1, 'test client 1')
        let client_2 = gen_client(institution_1, 'test client 2')
        let client_3 = gen_client(institution_1, 'test client 3')
        let project_1 = gen_project(institution_1, client_1, 'test project 1')
        let project_2 = gen_project(institution_1, client_1, 'test project 2')
        let project_3 = gen_project(institution_1, client_2, 'test project 3')
        let project_4 = gen_project(institution_1, client_2, 'test project 4')
        let project_5 = gen_project(institution_1, client_3, 'test project 5')
        let project_6 = gen_project(institution_1, client_3, 'test project 6')
        let institution_database = database(institution_1);
        let client_database = database(client_1, client_2, client_3);
        let project_database = database(project_1, project_2, project_3, project_4, project_5, project_6)
        let {
            vue,
            api
        } = get_setup(institution_database, client_database, project_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        vitamins.query(api.collection('institution') as Collection, {},
            (result: result) => [api.collection('institution')?.document(result._id).collection('project') as generated_collection_interface, {client_id: client_1._id}],
            (result: result) => [api.collection('institution')?.document(result._id).collection('project') as generated_collection_interface, {client_id: client_2._id}],
        )
        await sleep(100);

        let test_against = gen_vue();
        test_against.institution.set(institution_1._id, structuredClone(institution_1));
        test_against.project.set(project_1._id, structuredClone(project_1));
        test_against.project.set(project_2._id, structuredClone(project_2));
        test_against.project.set(project_3._id, structuredClone(project_3));
        test_against.project.set(project_4._id, structuredClone(project_4));

        assert.deepEqual(vue.institution.get(institution_1._id), institution_1)
        assert.deepEqual(vue.project.get(project_1._id), project_1)
        assert.deepEqual(vue.project.get(project_2._id), project_2)
        assert.deepEqual(vue.project.get(project_3._id), project_3)
        assert.deepEqual(vue.project.get(project_4._id), project_4)
        assert.deepEqual(vue, test_against)
        
        // make sure that extra queries aren't happening
        assert.equal(api.collection('institution')?.meta_counter.get(institution_1._id) ?? 0, 1)
        assert.equal(api.collection('institution')?.document(institution_1._id).collection('project').meta_counter.get(project_1._id) ?? 0, 1)
        assert.equal(api.collection('institution')?.document(institution_1._id).collection('project').meta_counter.get(project_2._id) ?? 0, 1)
        assert.equal(api.collection('institution')?.document(institution_1._id).collection('project').meta_counter.get(project_3._id) ?? 0, 1)
        assert.equal(api.collection('institution')?.document(institution_1._id).collection('project').meta_counter.get(project_4._id) ?? 0, 1)
        assert.equal(api.collection('institution')?.document(institution_1._id).collection('project').meta_counter.get(project_5._id) ?? 0, 0)
        assert.equal(api.collection('institution')?.document(institution_1._id).collection('project').meta_counter.get(project_6._id) ?? 0, 0)
    });

    it(`should do a basic query that generates child queries accessing the same documents`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let institution_2 = gen_institution('test institution 2')
        let institution_3 = gen_institution('test institution 3')
        let client_1 = gen_client(institution_1, 'test client 1')
        let institution_database = database(institution_1, institution_2, institution_3);
        let client_database = database(client_1);
        let {
            vue,
            api
        } = get_setup(institution_database, client_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        vitamins.query(api.collection('institution') as Collection, {}, (result: result) => [api.collection('institution')?.document(result._id).collection('client') as generated_collection_interface, {_id: client_1._id}])
        await sleep(100);

        let test_against = gen_vue();
        test_against.institution.set(institution_1._id, structuredClone(institution_1));
        test_against.institution.set(institution_2._id, structuredClone(institution_2));
        test_against.institution.set(institution_3._id, structuredClone(institution_3));
        test_against.client.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.client.get(client_1._id), client_1)
        assert.deepEqual(vue.institution.get(institution_3._id), institution_3)
        assert.deepEqual(vue, test_against)

        assert.equal(api.collection('institution')?.document('*').collection('client').meta_counter.get(client_1._id), 1)
    });

})