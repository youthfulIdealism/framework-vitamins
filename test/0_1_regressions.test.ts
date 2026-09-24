import assert from "assert";

import { generated_collection_interface, result } from '../dist/type_generated_collection.js'
import { Vitamins } from '../dist/vitamins.js'

import { Client, Institution, Mutualism, Project, gen_institution, gen_client, gen_project, gen_mutualism } from './utils/testing_harness.js'

describe('Bug Regressions', function () { 
    
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

    function sleep(ms: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }



    it(`a sweeping query should not block a specific query's child queries`, async function () {
            let institution_1 = gen_institution('test institution 1')
            let client_1 = gen_client(institution_1, 'test client 1')
            let project_1 = gen_project(institution_1, client_1, 'test project')
            let mutualism_1 = gen_mutualism(institution_1, [client_1], 'test mutualism')
            let institution_database = database(institution_1);
            let client_database = database(client_1);
            let project_database = database(project_1);
            let mutualism_database = database(mutualism_1);
            let {
                vue,
                api
            } = get_setup(institution_database, client_database, project_database, mutualism_database);
    
            let vitamins = new Vitamins(vue);
            
            vitamins.query(api.collection('institution')?.document(institution_1._id).collection('client'), {},
                (client) => vitamins.document(api.collection('institution')?.document(institution_1._id).collection('project').document(project_1._id))
            ).run()
            await sleep(20);
    
            vitamins.query(api.collection('institution'), {},
                (institution) => { return vitamins.document(api.collection('institution').document(institution_1._id).collection('project').document(project_1._id),
                    (project) => { return vitamins.query(api.collection('institution').document(institution_1._id).collection('client').document(client_1._id).collection('mutualism')!, undefined);}
                )}
            ).run()
            await sleep(20);
    
            let test_against = gen_vue();
            test_against.institutions.set(institution_1._id, structuredClone(institution_1));
            test_against.clients.set(client_1._id, structuredClone(client_1));
            test_against.projects.set(project_1._id, structuredClone(project_1));
            test_against.mutualisms.set(mutualism_1._id, structuredClone(mutualism_1));
    
            assert.deepEqual(vue.institutions.get(institution_1._id), institution_1)
            assert.deepEqual(vue.clients.get(client_1._id), client_1)
            assert.deepEqual(vue.projects.get(project_1._id), project_1)
            assert.deepEqual(vue.mutualisms.get(mutualism_1._id), mutualism_1)
            assert.deepEqual(vue, test_against)
    
            /*assert.equal(api.collection('institution')?.meta_counter.get(institution_1._id), 1)
            assert.equal(api.collection('institution')?.document('*').collection('client').meta_counter.get(client_1._id), 1)
            assert.equal(api.collection('institution')?.document('*').collection('client').meta_counter.get(client_2._id), 1)
            assert.equal(api.collection('institution')?.document('*').collection('client').meta_counter.get(client_3._id), 1)*/
        });

        it(`should allow for updating manually-added external documents`, async function () {
            
            let institution_database = database();
            let {
                vue,
                api
            } = get_setup(institution_database);
    
            let vitamins = new Vitamins(vue);
            await sleep(20);

            let institution = gen_institution('test institution');
            //vitamins.vue['institutions'].set(institution._id, institution);
            vitamins.add_document_from_external(api.collection('institution').document(institution._id), institution);
    
            let test_against = gen_vue();
            test_against.institutions.set(institution._id, structuredClone(institution));
    
            assert.deepEqual(vue.institutions.get(institution._id), institution)
            assert.deepEqual(vue, test_against)

            let updated_institution = structuredClone(institution);
            updated_institution.name = 'mystery hot dog shack'
            test_against.institutions.set(updated_institution._id, structuredClone(updated_institution));

            vitamins.update_document_from_external(institution._id, updated_institution);
            
            assert.deepEqual(vue.institutions.get(updated_institution._id), updated_institution)
            assert.deepEqual(vue, test_against)
        });

        it(`should fix duplicate queries when using advanced queries`, async function () {
            let institution = gen_institution('test institution')
            let institution_database = database(institution);
            let {
                vue,
                api
            } = get_setup(institution_database);
    
            let vitamins = new Vitamins(vue);
            let query_1 = await vitamins.query(api.collection('institution'), { advanced_query: { $and: [] }}).run()
            await sleep(20);

            let query_2 = await vitamins.query(api.collection('institution'), { advanced_query: { $and: [] }}).run()

            assert.equal(query_1.query.id, query_2.query.id)
        });

        it(`a document query that does not generate children should not fail`, async function () {
            let institution = gen_institution('test institution')
            let client_1 = gen_client(institution, 'test client 1')
            let institution_database = database(institution);
            let client_database = database(client_1);
            let {
                vue,
                api
            } = get_setup(institution_database, client_database);
    
            let vitamins = new Vitamins(vue);
            let query_1 = await vitamins.document(api.collection('institution').document('irrelevant_doc'),
                (institution) => vitamins.document(api.collection('institution').document(institution._id).collection('client').document(client_1._id))
            ).run()
            await sleep(20);
        });

        it(`unlistening to one of two identical queries should not unlisten to both.`, async function () {
            let institution = gen_institution('test institution')
            let institution_database = database(institution);
            let {
                vue,
                api
            } = get_setup(institution_database);
    
            let vitamins = new Vitamins(vue);
            let query_1 = await vitamins.document(api.collection('institution').document('irrelevant_doc')).run();
            let query_2 = await vitamins.document(api.collection('institution').document('irrelevant_doc')).run();
            let query_3 = await vitamins.document(api.collection('institution').document('irrelevant_doc')).run();

            assert.equal(query_1.query.parents.size, 3);
            query_1.unlisten();
            assert.equal(query_1.query.parents.size, 2);
            query_2.unlisten();
            assert.equal(query_1.query.parents.size, 1);
            query_3.unlisten();
            assert.equal(query_1.query.parents.size, 0);
        });

        it(`reciprocal child generators between two collections should not recurse infinitely`, async function () {
            let institution = gen_institution('test institution')
            let client_1 = gen_client(institution, 'test client 1')
            let project_1 = gen_project(institution, client_1, 'test project')
            let {
                vue,
                api
            } = get_setup(database(institution), database(client_1), database(project_1));
            let clients = api.collection('institution').document(institution._id).collection('client') as Client;
            let projects = api.collection('institution').document(institution._id).collection('project') as Project;

            let vitamins = new Vitamins(vue);

            // client -> projects for that client
            await vitamins.query(clients, {},
                (client) => vitamins.query(projects, { client_id: client._id })
            ).run();
            await sleep(20);

            // project -> the client it references
            await vitamins.query(projects, {},
                (project) => vitamins.document(clients.document(project.client_id))
            ).run();
            await sleep(20);

            assert.deepEqual(vue.clients.get(client_1._id), client_1)
            assert.deepEqual(vue.projects.get(project_1._id), project_1)
            // a runaway recursion leaves thousands of generated queries behind
            assert.ok(vitamins.all_queries.size < 20, `expected a bounded number of queries, found ${vitamins.all_queries.size}`)
        });

        it(`a generated query that duplicates an existing query should be replaced by it, not left behind`, async function () {
            let institution_1 = gen_institution('test institution 1')
            let institution_2 = gen_institution('test institution 2')
            let client_1 = gen_client(institution_1, 'test client 1')
            let {
                vue,
                api
            } = get_setup(database(institution_1, institution_2), database(client_1));

            let vitamins = new Vitamins(vue);

            // a top-level query, so that the generated query below is a duplicate of it
            let top = await vitamins.query(api.collection('institution'), { _id: institution_1._id }).run();
            await sleep(20);

            let query = await vitamins.document(api.collection('institution').document('*').collection('client').document(client_1._id),
                (client) => vitamins.query(api.collection('institution'), { _id: client.institution_id })
            ).run();
            await sleep(20);

            // the duplicate should have been swapped out for the existing query
            assert.equal(vitamins.queries_by_collection.get('institution')!.size, 1);
            assert.ok(Array.from(vitamins.documents.get(client_1._id)!.links.values()).some(link => link.query === top.query));

            // once the client moves and the top-level listener goes away, nothing should hold institution_1
            client_1.institution_id = institution_2._id;
            await query.rerun();
            await sleep(20);
            top.unlisten();

            let test_against = gen_vue();
            test_against.institutions.set(institution_2._id, structuredClone(institution_2));
            test_against.clients.set(client_1._id, structuredClone(client_1));
            assert.deepEqual(vue, test_against);
            assert.equal(vitamins.queries_by_collection.get('institution')!.size, 1);
        });

        it(`inline generators should not pile up when their parent document updates`, async function () {
            let institution = gen_institution('test institution')
            let client_1 = gen_client(institution, 'test client 1')
            let project_1 = gen_project(institution, client_1, 'test project')
            let {
                vue,
                api
            } = get_setup(database(institution), database(client_1), database(project_1));
            let clients = api.collection('institution').document(institution._id).collection('client') as Client;
            let projects = api.collection('institution').document(institution._id).collection('project') as Project;

            let vitamins = new Vitamins(vue);

            // two levels of inline generators, each a fresh closure every time its parent generator runs
            await vitamins.query(clients, {},
                (client) => vitamins.query(projects, { client_id: client._id },
                    (project) => vitamins.document(clients.document(project.client_id),
                        () => undefined
                    )
                )
            ).run();
            await sleep(20);

            let project_query = Array.from(vitamins.queries_by_collection.get('project')!)[0];
            let client_get_query = Array.from(vitamins.queries_by_collection.get('client')!).find(ele => ele.operation === 'get')!;
            assert.equal(project_query.generators.size, 1);
            assert.equal(client_get_query.generators.size, 1);

            for(let q = 0; q < 5; q++){
                vitamins.update_document_from_external(client_1._id, Object.assign(structuredClone(client_1), { name: `renamed client ${q}` }));
                await sleep(20);
            }

            assert.equal(project_query.generators.size, 1);
            assert.equal(client_get_query.generators.size, 1);
            assert.equal(vue.clients.get(client_1._id).name, 'renamed client 4');
        });

        it(`mutually recursive shared generators should not grow as documents update`, async function () {
            let institution = gen_institution('test institution')
            let client_1 = gen_client(institution, 'test client 1')
            let project_1 = gen_project(institution, client_1, 'test project')
            let {
                vue,
                api
            } = get_setup(database(institution), database(client_1), database(project_1));
            let clients = api.collection('institution').document(institution._id).collection('client') as Client;
            let projects = api.collection('institution').document(institution._id).collection('project') as Project;

            let vitamins = new Vitamins(vue);

            let project_generator: (project: any) => any;
            let client_generator = (client: any) => vitamins.query(projects, { client_id: client._id }, project_generator);
            project_generator = (project: any) => vitamins.document(clients.document(project.client_id), client_generator);

            await vitamins.query(clients, {}, client_generator).run();
            await sleep(20);

            function count() {
                let queries = Array.from(vitamins.all_queries.values());
                return {
                    queries: queries.length,
                    generators: queries.reduce((sum, ele) => sum + ele.generators.size, 0),
                    links: Array.from(vitamins.documents.values()).reduce((sum, ele) => sum + ele.links.size, 0),
                };
            }
            let before = count();

            for(let q = 0; q < 5; q++){
                vitamins.update_document_from_external(client_1._id, Object.assign(structuredClone(client_1), { name: `renamed client ${q}` }));
                vitamins.update_document_from_external(project_1._id, Object.assign(structuredClone(project_1), { name: `renamed project ${q}` }));
                await sleep(20);
            }

            assert.deepEqual(count(), before);
        });

        it(`unlistening a root should remove the generators it contributed to a shared query`, async function () {
            let institution = gen_institution('test institution')
            let client_1 = gen_client(institution, 'test client 1')
            let project_1 = gen_project(institution, client_1, 'test project')
            let {
                vue,
                api
            } = get_setup(database(institution), database(client_1), database(project_1));
            let clients = api.collection('institution').document(institution._id).collection('client') as Client;
            let projects = api.collection('institution').document(institution._id).collection('project') as Project;

            let vitamins = new Vitamins(vue);

            let generator_1 = (project: any) => vitamins.document(clients.document(project.client_id));
            let generator_2 = (project: any) => vitamins.document(api.collection('institution').document(project.institution_id));

            let query_1 = await vitamins.query(projects, {}, generator_1).run();
            await sleep(20);
            let query_2 = await vitamins.query(projects, {}, generator_2).run();
            await sleep(20);

            assert.equal(query_1.query.id, query_2.query.id);
            assert.equal(query_1.query.generators.size, 2);

            query_1.unlisten();
            assert.equal(query_2.query.generators.size, 1);
            assert.ok(query_2.query.generators.has(generator_2));

            // what only generator_1 loaded should be gone, what generator_2 loaded should remain
            assert.ok(!vue.clients.has(client_1._id));
            assert.ok(vue.institutions.has(institution._id));
            assert.ok(vue.projects.has(project_1._id));
        });

        it(`a nested generator's output should be dropped when the parent data it closed over changes`, async function () {
            let institution_1 = gen_institution('test institution 1')
            let institution_2 = gen_institution('test institution 2')
            let client_1 = gen_client(institution_1, 'test client 1')
            let project_1 = gen_project(institution_1, client_1, 'test project')
            let {
                vue,
                api
            } = get_setup(database(institution_1, institution_2), database(client_1), database(project_1));
            let institutions = api.collection('institution') as Institution;
            let clients = institutions.document(institution_1._id).collection('client') as Client;
            let projects = institutions.document(institution_1._id).collection('project') as Project;

            let vitamins = new Vitamins(vue);

            // the innermost generator closes over the client, not the project it's called with
            await vitamins.query(clients, {},
                (client) => vitamins.query(projects, { client_id: client._id },
                    () => vitamins.document(institutions.document(client.institution_id))
                )
            ).run();
            await sleep(20);
            assert.ok(vue.institutions.has(institution_1._id));
            let fetches = institutions.meta_counter.get(institution_1._id);

            // an unrelated change produces the same queries, which should survive rather than be refetched
            let renamed_client = Object.assign(structuredClone(client_1), { name: 'renamed client' });
            vitamins.update_document_from_external(client_1._id, renamed_client);
            await sleep(20);
            assert.ok(vue.institutions.has(institution_1._id));
            assert.equal(institutions.meta_counter.get(institution_1._id), fetches);

            // changing what the closure captured should swap the institution it loaded
            let moved_client = Object.assign(structuredClone(renamed_client), { institution_id: institution_2._id });
            vitamins.update_document_from_external(client_1._id, moved_client);
            await sleep(20);

            let test_against = gen_vue();
            test_against.institutions.set(institution_2._id, structuredClone(institution_2));
            test_against.clients.set(client_1._id, structuredClone(moved_client));
            test_against.projects.set(project_1._id, structuredClone(project_1));
            assert.deepEqual(vue, test_against);
        });

        it(`unlistening both roots of reciprocal generators should clean up the cycle between them`, async function () {
            let institution = gen_institution('test institution')
            let client_1 = gen_client(institution, 'test client 1')
            let project_1 = gen_project(institution, client_1, 'test project')
            let {
                vue,
                api
            } = get_setup(database(institution), database(client_1), database(project_1));
            let clients = api.collection('institution').document(institution._id).collection('client') as Client;
            let projects = api.collection('institution').document(institution._id).collection('project') as Project;

            let vitamins = new Vitamins(vue);

            let query_1 = await vitamins.query(clients, {},
                (client) => vitamins.query(projects, { client_id: client._id })
            ).run();
            await sleep(20);
            let query_2 = await vitamins.query(projects, {},
                (project) => vitamins.document(clients.document(project.client_id))
            ).run();
            await sleep(20);

            query_1.unlisten();
            query_2.unlisten();

            assert.deepEqual(vue, gen_vue());
            assert.equal(vitamins.all_queries.size, 0);
            assert.equal(vitamins.documents.size, 0);
        });

        it(`unlistening the root of mutually recursive generators should clean up the cycle they form`, async function () {
            let institution = gen_institution('test institution')
            let client_1 = gen_client(institution, 'test client 1')
            let project_1 = gen_project(institution, client_1, 'test project')
            let {
                vue,
                api
            } = get_setup(database(institution), database(client_1), database(project_1));
            let clients = api.collection('institution').document(institution._id).collection('client') as Client;
            let projects = api.collection('institution').document(institution._id).collection('project') as Project;

            let vitamins = new Vitamins(vue);

            // the generators holding the cycle together are contributed from inside the cycle
            let project_generator: (project: any) => any;
            let client_generator = (client: any) => vitamins.query(projects, { client_id: client._id }, project_generator);
            project_generator = (project: any) => vitamins.document(clients.document(project.client_id), client_generator);

            let query = await vitamins.query(clients, {}, client_generator).run();
            await sleep(20);
            assert.ok(vue.projects.has(project_1._id));

            query.unlisten();

            assert.deepEqual(vue, gen_vue());
            assert.equal(vitamins.all_queries.size, 0);
            assert.equal(vitamins.documents.size, 0);
        });

        it(`reciprocal child generators with inline generators should not recurse infinitely`, async function () {
            let institution = gen_institution('test institution')
            let client_1 = gen_client(institution, 'test client 1')
            let project_1 = gen_project(institution, client_1, 'test project')
            let {
                vue,
                api
            } = get_setup(database(institution), database(client_1), database(project_1));
            let clients = api.collection('institution').document(institution._id).collection('client') as Client;
            let projects = api.collection('institution').document(institution._id).collection('project') as Project;

            let vitamins = new Vitamins(vue);

            // each generator creates a fresh closure every time it runs, so the deduper always sees "new" generators
            let query_1 = await vitamins.query(clients, {},
                (client) => vitamins.query(projects, { client_id: client._id },
                    (project) => vitamins.document(clients.document(project.client_id))
                )
            ).run();
            await sleep(20);

            let query_2 = await vitamins.query(projects, {},
                (project) => vitamins.document(clients.document(project.client_id),
                    (client) => vitamins.query(projects, { client_id: client._id })
                )
            ).run();
            await sleep(20);

            assert.deepEqual(vue.clients.get(client_1._id), client_1)
            assert.deepEqual(vue.projects.get(project_1._id), project_1)
            // a runaway recursion leaves thousands of generated queries behind
            assert.ok(vitamins.all_queries.size < 20, `expected a bounded number of queries, found ${vitamins.all_queries.size}`)

            // and once nothing is listening, none of it should survive
            query_1.unlisten();
            query_2.unlisten();
            assert.deepEqual(vue, gen_vue());
            assert.equal(vitamins.all_queries.size, 0);
            assert.equal(vitamins.documents.size, 0);
        });
});