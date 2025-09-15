import assert from "assert";

import { generated_collection_interface, result } from '../dist/type_generated_collection'
import { Vitamins } from '../dist/vitamins'

import { Client, Institution, Mutualism, Project, gen_institution, gen_client, gen_project, gen_mutualism } from './utils/testing_harness.js'

describe('Client Library Generation: Library Generation', function () { 
    
    function get_setup(
        institution_database: Map<string, any> = new Map<string, any>(),
        client_database: Map<string, any> = new Map<string, any>(),
        project_database: Map<string, any> = new Map<string, any>(),
        mutualsm_database: Map<string, any> = new Map<string, any>()
    ) {

        let collection_mutualism = new Mutualism(
            ['institution', 'client', 'mutualism'],
            mutualsm_database
        )

        let collection_project = new Project(
            ['institution', 'project'],
            project_database
        )

        let collection_client = new Client(
            ['institution', 'client'],
            client_database,
            collection_mutualism
        )

        let collection_institution = new Institution(
            ['institution'],
            institution_database,
            collection_client,
            collection_project
        )

        let api = {
            collection(collection_id: 'institution'){
                switch(collection_id) {
                    case 'institution':
                        return collection_institution
                }
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
            institutions: new Map<string, any>(),
            clients: new Map<string, any>(),
            projects: new Map<string, any>(),
            mutualisms: new Map<string, any>(),
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

    it(`should do a basic query`, async function () {
        let institution = gen_institution('test institution')
        let institution_database = database(institution);
        let {
            vue,
            api
        } = get_setup(institution_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        await vitamins.query(api.collection('institution'), {}).run()
        await sleep(20);

        let test_against = gen_vue();
        test_against.institutions.set(institution._id, structuredClone(institution));

        assert.deepEqual(vue.institutions.get(institution._id), institution)
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
        vitamins.query(api.collection('institution'), {}).run()
        await sleep(20);

        let test_against = gen_vue();
        test_against.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against.institutions.set(institution_2._id, structuredClone(institution_2));
        test_against.institutions.set(institution_3._id, structuredClone(institution_3));

        assert.deepEqual(vue.institutions.get(institution_3._id), institution_3)
        assert.deepEqual(vue, test_against)
    });

    it(`should do a basic document query`, async function () {
        let institution = gen_institution('test institution')
        let institution_database = database(institution);
        let {
            vue,
            api
        } = get_setup(institution_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        //@ts-expect-error
        await vitamins.query(api.collection('institution')?.document(institution._id), {}).run()
        await sleep(20);

        let test_against = gen_vue();
        test_against.institutions.set(institution._id, structuredClone(institution));

        assert.deepEqual(vue.institutions.get(institution._id), institution)
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
        vitamins.query(api.collection('institution'), {},
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {})
        ).run()
        await sleep(20);

        let test_against = gen_vue();
        test_against.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against.clients.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.institutions.get(institution_1._id), institution_1)
        assert.deepEqual(vue.clients.get(client_1._id), client_1)
        assert.deepEqual(vue, test_against)
    });

    it(`should do a basic document query that generates a child query`, async function () {
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
        //@ts-expect-error
        vitamins.query(api.collection('institution').document(institution_1._id), undefined,
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {})
        ).run()
        await sleep(20);

        let test_against = gen_vue();
        test_against.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against.clients.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.institutions.get(institution_1._id), institution_1)
        assert.deepEqual(vue.clients.get(client_1._id), client_1)
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
        vitamins.query(api.collection('institution'), {},
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('project'), {client_id: client_1._id}),
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('project'), {client_id: client_2._id}),
        ).run()
        await sleep(20);

        let test_against = gen_vue();
        test_against.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against.projects.set(project_1._id, structuredClone(project_1));
        test_against.projects.set(project_2._id, structuredClone(project_2));
        test_against.projects.set(project_3._id, structuredClone(project_3));
        test_against.projects.set(project_4._id, structuredClone(project_4));

        assert.deepEqual(vue.institutions.get(institution_1._id), institution_1)
        assert.deepEqual(vue.projects.get(project_1._id), project_1)
        assert.deepEqual(vue.projects.get(project_2._id), project_2)
        assert.deepEqual(vue.projects.get(project_3._id), project_3)
        assert.deepEqual(vue.projects.get(project_4._id), project_4)
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
        vitamins.query(api.collection('institution'), {},
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {_id: client_1._id}),
        ).run()
        await sleep(20);

        let test_against = gen_vue();
        test_against.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against.institutions.set(institution_2._id, structuredClone(institution_2));
        test_against.institutions.set(institution_3._id, structuredClone(institution_3));
        test_against.clients.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.clients.get(client_1._id), client_1)
        assert.deepEqual(vue.institutions.get(institution_3._id), institution_3)
        assert.deepEqual(vue, test_against)

        assert.equal(api.collection('institution')?.document('*').collection('client').meta_counter.get(client_1._id), 1)
    });

    it(`when two identical queries with different children are generated, the query should run only once and both children should run correctly`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let client_1 = gen_client(institution_1, 'test client 1')
        let client_2 = gen_client(institution_1, 'test client 2')
        let client_3 = gen_client(institution_1, 'test client 3')
        let institution_database = database(institution_1);
        let client_database = database(client_1, client_2, client_3);
        let {
            vue,
            api
        } = get_setup(institution_database, client_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        //@ts-expect-error
        vitamins.query(api.collection('institution')?.document(institution_1._id) as Collection, undefined,
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {_id: client_1._id}),
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {_id: client_2._id}),
        ).run()
        //@ts-expect-error
        vitamins.query(api.collection('institution')?.document(institution_1._id) as Collection, undefined,
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {_id: client_2._id}),
            (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {_id: client_3._id}),
        ).run()
        await sleep(20);

        let test_against = gen_vue();
        test_against.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against.clients.set(client_1._id, structuredClone(client_1));
        test_against.clients.set(client_2._id, structuredClone(client_2));
        test_against.clients.set(client_3._id, structuredClone(client_3));

        assert.deepEqual(vue.clients.get(client_1._id), client_1)
        assert.deepEqual(vue.clients.get(client_2._id), client_2)
        assert.deepEqual(vue.clients.get(client_3._id), client_3)
        assert.deepEqual(vue, test_against)

        assert.equal(api.collection('institution')?.meta_counter.get(institution_1._id), 1)
        assert.equal(api.collection('institution')?.document('*').collection('client').meta_counter.get(client_1._id), 1)
        assert.equal(api.collection('institution')?.document('*').collection('client').meta_counter.get(client_2._id), 1)
        assert.equal(api.collection('institution')?.document('*').collection('client').meta_counter.get(client_3._id), 1)
    });

    it(`should switch targets when the data changes`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let institution_2 = gen_institution('test institution 2')
        let client_1 = gen_client(institution_1, 'test client 1')
        let institution_database = database(institution_1, institution_2);
        let client_database = database(client_1);
        let {
            vue,
            api
        } = get_setup(institution_database, client_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        //@ts-expect-error
        let query = await vitamins.query(api.collection('institution')?.document('*').collection('client').document(client_1._id) as Collection, undefined,
            //@ts-expect-error
            (result) => vitamins.query(api.collection('institution'), {_id: result.institution_id }),
        ).run()
        await sleep(20);

        let test_against_phase_1 = gen_vue();
        test_against_phase_1.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against_phase_1.clients.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.clients.get(client_1._id), client_1)
        assert.deepEqual(vue.institutions.get(institution_1._id), institution_1)
        assert.deepEqual(vue, test_against_phase_1)

        client_1.institution_id = institution_2._id;
        query.rerun();
        await sleep(20);

        let test_against_phase_2 = gen_vue();
        test_against_phase_2.institutions.set(institution_2._id, structuredClone(institution_2));
        test_against_phase_2.clients.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.clients.get(client_1._id), client_1);
        assert.deepEqual(vue.institutions.get(institution_2._id), institution_2);
        assert.deepEqual(vue, test_against_phase_2);
    });

    it(`should switch targets when the data changes using update_document_from_external`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let institution_2 = gen_institution('test institution 2')
        let client_1 = gen_client(institution_1, 'test client 1')
        let institution_database = database(institution_1, institution_2);
        let client_database = database(client_1);
        let {
            vue,
            api
        } = get_setup(institution_database, client_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        //@ts-expect-error
        let query = await vitamins.query(api.collection('institution')?.document('*').collection('client').document(client_1._id) as Collection, undefined,
            //@ts-expect-error
            (result) => vitamins.query(api.collection('institution'), {_id: result.institution_id }),
        ).run()
        await sleep(20);

        let test_against_phase_1 = gen_vue();
        test_against_phase_1.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against_phase_1.clients.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.clients.get(client_1._id), client_1)
        assert.deepEqual(vue.institutions.get(institution_1._id), institution_1)
        assert.deepEqual(vue, test_against_phase_1)

        vitamins.update_document_from_external(client_1._id, Object.assign(client_1, {institution_id: institution_2._id}))
        await sleep(20);

        let test_against_phase_2 = gen_vue();
        test_against_phase_2.institutions.set(institution_2._id, structuredClone(institution_2));
        test_against_phase_2.clients.set(client_1._id, structuredClone(client_1));

        assert.deepEqual(vue.clients.get(client_1._id), client_1);
        assert.deepEqual(vue.institutions.get(institution_2._id), institution_2);
        assert.deepEqual(vue, test_against_phase_2);
    });

    it(`should handle an external deletion`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let client_1 = gen_client(institution_1, 'test client 1')
        let project_1 = gen_project(institution_1, client_1, 'test project 1')
        let institution_database = database(institution_1);
        let client_database = database(client_1);
        let project_database = database(project_1);
        let {
            vue,
            api
        } = get_setup(institution_database, client_database, project_database);

        //@ts-expect-error
        let vitamins = new Vitamins(vue);
        let query = await vitamins.query(api.collection('institution'), {},
            (result) => vitamins.query(api.collection('institution')?.document('*').collection('client'), {institution_id: result._id }, 
                (result) => vitamins.query(api.collection('institution')?.document('*').collection('project'), {client_id: result._id })
            ),
        ).run()
        await sleep(20);

        let test_against_phase_1 = gen_vue();
        test_against_phase_1.institutions.set(institution_1._id, structuredClone(institution_1));
        test_against_phase_1.clients.set(client_1._id, structuredClone(client_1));
        test_against_phase_1.projects.set(project_1._id, structuredClone(project_1));

        assert.deepEqual(vue, test_against_phase_1)

        vitamins.delete_document_from_external(client_1._id);
        await sleep(20);

        let test_against_phase_2 = gen_vue();
        test_against_phase_2.institutions.set(institution_1._id, structuredClone(institution_1));

        assert.deepEqual(vue, test_against_phase_2)
    });

    it(`in a basic query, errors get bubbled up to the parent context`, async function () {
        let institution = gen_institution('test institution')
        let institution_database = database(institution);
        let {
            vue,
            api,
            collection_institution
        } = get_setup(institution_database);

        collection_institution.errors = true;

        assert.rejects(async () => {
            //@ts-expect-error
            let vitamins = new Vitamins(vue);
            await vitamins.query(api.collection('institution'), {}).run()
        }, 'Error: arbitrary error');
    });


    it(`in a basic query that generates a child query, errors get bubbled up to the parent context`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let client_1 = gen_client(institution_1, 'test client 1')
        let institution_database = database(institution_1);
        let client_database = database(client_1);
        let {
            vue,
            api
        } = get_setup(institution_database, client_database);

        assert.rejects(async () => {
            //@ts-expect-error
            let vitamins = new Vitamins(vue);
            await vitamins.query(api.collection('institution'), {},
                (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {})
            ).run()
        }, 'Error: arbitrary error');
    });

    it(`in a basic document query that generates a child query, errors get bubbled up to the parent context`, async function () {
        let institution_1 = gen_institution('test institution 1')
        let client_1 = gen_client(institution_1, 'test client 1')
        let institution_database = database(institution_1);
        let client_database = database(client_1);
        let {
            vue,
            api
        } = get_setup(institution_database, client_database);

        assert.rejects(async () => {
            //@ts-expect-error
            let vitamins = new Vitamins(vue);
            //@ts-expect-error
            await vitamins.query(api.collection('institution').document(institution_1._id), undefined,
                (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('client'), {})
            ).run()
        }, 'Error: arbitrary error');
    });

    it(`in a basic query that generates a child query that generates a child query, errors get bubbled up to the parent context`, async function () {
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

        assert.rejects(async () => {
            //@ts-expect-error
            let vitamins = new Vitamins(vue);
            await vitamins.query(api.collection('institution'), {},
                (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('project'), {client_id: client_1._id}),
                (result) => vitamins.query(api.collection('institution')?.document(result._id).collection('project'), {client_id: client_2._id}),
            ).run();
        }, 'Error: arbitrary error');
    });

    // TODO: vue needs the ability to have a different name for the collection.
    // for example, the collection ID may be "user", but on vue it needs to be "users".
});