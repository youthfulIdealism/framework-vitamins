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
                    //@ts-ignore
                    (project) => { return vitamins.query(api.collection('institution').document(institution_1._id).collection('client').document(client_1._id).collection('mutualism'), undefined);}
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

            assert.equal(query_1.id, query_2.id)
        });
});