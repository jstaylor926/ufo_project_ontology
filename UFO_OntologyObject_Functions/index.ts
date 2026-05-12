import {Integer,  LocalDate, Function,Edits, OntologyEditFunction, isTimestamp, Timestamp, FunctionsMap, Filters} from "@foundry/functions-api";
import { Objects,  ObjectSet, Ufoentry, UfopathObject, PriorityAlgorithm, UfoICAO, UfoFsr, _inferRepairDossierStatus, Fsrteam} from "@foundry/ontology-api";
//import { PathSupp } from "./PathSupp";
import { commentUsers } from './commentUsersDictionary';
import {Comments} from "./Comments";

import { Misc } from "./Misc";
import {FSRFunctions } from "./FSRFunctions";
import {FsrTeam} from "./fsrTeam";

import {ReportGenerator} from "./reportGenerator"

// V2 forward-compatibility — translate snake_case PriorityAlgorithm
// parameter keys to their V1 equivalents before the switch below sees
// them. See v2compat.ts for the mapping table. V1 keys pass through
// unchanged; unknown keys pass through unchanged (preserving the V1
// default-no-match behavior).
import { toV1PriorityKey } from "./v2compat";

export {Comments, Misc, FSRFunctions, FsrTeam, ReportGenerator};
// All functions that act on the Ontology are found here 
// Comments are made above the line of code they are pertinent to

export class MyFunctions {
    
     //Driver Functions 
    //Driver Function for prioritization on a set of UFOEntries
    @OntologyEditFunction()
    public async  priorityDriver(entries: ObjectSet<Ufoentry>):Promise<void> {
        //Pull parameter UFO entries 
        let ufoArr = entries.all()
        //Selects PriorityAlgorithm Object where mainConfigFlag == 1 
        //      only one object will have mainConfigFlag == 1, see setMainConfig()
        //algo : Active PriorityAlgorithm 
        //config: algo cast as an array of string arrays 
        //      structure of config: 
        //          config[0] : list of parameters 
        //              ex : ['OperatorICAO', 'AircraftStatus', 'HighestMesageUrgency', 'BlankParameter', 'BlankParameter', 'BlankParameter'.....]
        //          config[1]- config[10]: corresponding tiers for each parameter
        //              ex: ['AAL','DAL','JBU','ASA','FFT']
        //              ex: ['-24','70','span'] <-- this structure is used to signify a specific scoring structure, detailed later
        let arr  = Objects.search().priorityAlgorithm().all().filter(item => item.mainConfigFlag === 1); 
        let algo = arr[0]; 
        let config = await this.configureAlgorithm(algo, entries) as string[][];
        // for loop going through every UFOentry in priorityDriver() parameters       
        for (let i = 0; i < ufoArr.length; i++) {
            let bump = ufoArr[i].sbcbump;
            if (bump === undefined) {
                bump = 0;
            }
            //retrieves the atual values that will be scored for each entry
            // vals : array of string arrays 
            //      structure of vals:
            //          vals[0]- vals[10] : arrays of length 2 
            //              vals[0][0] : 'Parameter'
            //              vals[0][1] : Value 
            //              vals[0] ex: [ 'Priority', 'Green' ]
            //              vals ex:  [ [ 'Priority', 'Green' ], [ 'AircraftStatus', 'No Value' ],[ 'highest_Message_Urgency', critical] ] 
            let vals = this.getPriorityValsForOneEntry(config, ufoArr[i]) as string [][];
            // with the pertinent values (vals) and the active configuration (config), the score is calculated for a particular entry 
            // score : int 
            let score = this.calculateGlobalScore(vals, config, bump);
            // score is assigned to entry
            ufoArr[i].globalPriorityScore = score;        
        }
    }

   //Driver Function for prioritization on a set of UFOEntries
    //"Tester" function, instead of selecting the active PriorityAlgorithm object,
    //    the function uses the PriorityAlgorithm passed in as a parameter 
    //allows a user to "sample" a PriorityAlgorithm object 
    // used in scenarios in Workshop Module 
    @OntologyEditFunction()
    public async  priorityDriverTester(entries: ObjectSet<Ufoentry>, algo: PriorityAlgorithm):Promise<void> {              
        // config variable is the only difference between this function and previous driver function 
        let ufoArr = entries.all()
        let config = await this.configureAlgorithm(algo, entries) as string[][];        
        for (let i = 0; i < ufoArr.length; i++) {
            let bump = ufoArr[i].sbcbump;
            if (bump === undefined) {
                bump = 0;
            }
            let vals = this.getPriorityValsForOneEntry(config, ufoArr[i]) as string [][];
            let score = this.calculateGlobalScore(vals, config, bump);
            ufoArr[i].globalPriorityScore = score;
        
        }
    }

        @OntologyEditFunction ()
    public async sbcBumpAndPriorityCalc(entry: Ufoentry, bump : Integer, entries: ObjectSet<Ufoentry>) : Promise<void> {
        entry.sbcbump = bump; 
        await this.calculateOneEntryScore(entry, entries);
    }



//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 //Functions for Data assembling 


    //read the configuration (generated by the workshop module) and return an array of strings representing the configuration 
    //input : priorityalgorithm ontology object 
    //return: array of string arrays, index 0 holds the properties that the priority algorithm will read along (up to 10) , index 1-10 hold configuration rules about the parameters
    //sample output : [ [status, domain, flight hours, msn, .....], [Open], [web, engineering, software] , [0,100] ]
    @Function()
    public async configureAlgorithm(algoConfig:PriorityAlgorithm, entries: ObjectSet<Ufoentry>): Promise<(string | undefined)[][]> {

        //parameters[] holds a list of all the properties that are going to be scored ex: ['highestMessUrgency', 'RTS', 'Status']
        //  empty parameters are stored as 'BlankParameter'
        let parameters = [algoConfig.priorityParameter1, algoConfig.priorityParameter2, algoConfig.priorityParameter3, algoConfig.priorityParameter4, algoConfig.priorityParameter5,
                          algoConfig.priorityParameter6, algoConfig.priorityParameter7, algoConfig.priorityParameter8, algoConfig.priorityParameter9, algoConfig.priorityParameter10];
        //some parameters might be marked as 'span' parameters, defined in documentation 
        // spanBools[] holds the boolean variable that determines if a property is a span parameter or not
        let spanBools = [algoConfig.spanBool1, algoConfig.spanBool2, algoConfig.spanBool3, algoConfig.spanBool4, algoConfig.spanBool5, algoConfig.spanBool6,algoConfig.spanBool7,
                         algoConfig.spanBool8, algoConfig.spanBool9, algoConfig.spanBool10]

        //Configuring the exact scoring values for each parameter 
        let param1Config = []
        //if it is a spanParameter 
        if(spanBools[0] === true) {
            //call a helperFunction, defined below, to find the upper and lower bounds of a property within the UFO object set (entries)
            param1Config = await this.findBounds(parameters[0],entries)
            // push a string to signify that this is a spanBool 
            param1Config.push("span");
        }
        //if it is not a spanBool 
        else {
            // form an aray of PriorityAlgorithm object properties representing the tiers within a property 
            param1Config = [algoConfig.priPa1L1,algoConfig.priPa1L2, algoConfig.priPa1L3, algoConfig.priPa1L4, algoConfig.priPa1L5,];
        }

        //param2Config- param10Config are populated the same way
        //probably could be condensed into a for loop
        let param2Config = []
        if(spanBools[1] === true) {
            param2Config = await this.findBounds(parameters[1],entries)
            param2Config.push("span");
        } else {
            param2Config = [algoConfig.priPa2L1,algoConfig.priPa2L2, algoConfig.priPa2L3, algoConfig.priPa2L4, algoConfig.priPa2L5];
        }
        let param3Config = []
        if(spanBools[2] === true) {
            param3Config = await this.findBounds(parameters[2],entries)
            param3Config.push("span");
        } else {
            param3Config = [algoConfig.priPa3L1,algoConfig.priPa3L2, algoConfig.priPa3L3, algoConfig.priPa3L4, algoConfig.priPa3L5];
        }
        
        let param4Config = []
        if(spanBools[3] === true) {
            param4Config = await  this.findBounds(parameters[3],entries)
            param4Config.push("span");
        } else {
            param4Config = [algoConfig.priPa4L1,algoConfig.priPa4L2, algoConfig.priPa4L3, algoConfig.priPa4L4, algoConfig.priPa4L5];
        }

        let param5Config = []
        if(spanBools[4] === true) {
            param5Config = await this.findBounds(parameters[4],entries);
            param5Config.push("span");
        } else {
            param5Config =  [algoConfig.priPa5L1,algoConfig.priPa5L2, algoConfig.priPa5L3, algoConfig.priPa5L4, algoConfig.priPa5L5];
        }

        let param6Config = []
        if(spanBools[5] === true) {
            param6Config = await this.findBounds(parameters[5],entries)
            param6Config.push("span");
        } else {
            param6Config =  [algoConfig.priPa6L1,algoConfig.priPa6L2, algoConfig.priPa6L3, algoConfig.priPa6L4, algoConfig.priPa6L5];
        }

        let param7Config = []
        if(spanBools[6] === true) {
            param7Config = await this.findBounds(parameters[6],entries)
            param7Config.push("span");
        } else {
            param7Config =  [algoConfig.priPa7L1,algoConfig.priPa7L2, algoConfig.priPa7L3, algoConfig.priPa7L4, algoConfig.priPa7L5];
        }

        let param8Config = []
        if(spanBools[7] === true) {
            param8Config = await this.findBounds(parameters[7],entries)
            param8Config.push("span");
        } else {
            param8Config =  [algoConfig.priPa8L1,algoConfig.priPa8L2, algoConfig.priPa8L3, algoConfig.priPa8L4, algoConfig.priPa8L5];
        }

        let param9Config = []
        if(spanBools[8] === true) {
            param9Config.push("span");
            param9Config = await this.findBounds(parameters[8],entries)
        } else {
            param9Config = [algoConfig.priPa9L1,algoConfig.priPa9L2, algoConfig.priPa9L3, algoConfig.priPa9L4, algoConfig.priPa9L5];
        }
        
        let param10Config = []
        if(spanBools[8] === true) {
            param10Config.push("span");
            param10Config = await this.findBounds(parameters[9],entries)
        } else {
            param10Config = [algoConfig.priPa10L1,algoConfig.priPa10L2, algoConfig.priPa10L3, algoConfig.priPa10L4, algoConfig.priPa10L5];
        }
        let configuration = [parameters, param1Config, param2Config, param3Config, param4Config, param5Config, param6Config, param7Config, param8Config, param9Config, param10Config];
        return configuration 
    }

    //Driver Function for prioritization on a single UFOEntry
    //used when FSR makes edit to one UFOentry and the change triggers a recalculation of priority score
    @OntologyEditFunction()
    public async calculateOneEntryScore(entry: Ufoentry, entries: ObjectSet<Ufoentry> ) :Promise<void> {
        //same structure as driver function w/o a for loop
        let arr  = Objects.search().priorityAlgorithm().all().filter(item => item.mainConfigFlag === 1.0);
        let algo = arr[0]; 
        let bump = entry.sbcbump;
        if (bump === undefined) {
                bump = 0;
        }
        let config = await this.configureAlgorithm(algo, entries) as string[][];
        let vals = this.getPriorityValsForOneEntry(config, entry) as string [][];
        let score = this.calculateGlobalScore(vals, config, bump);
        entry.globalPriorityScore = score;
    }

    
    //reads the parameters, defined by the priority algorithm configuration, of a particualr ufo entry an array of string arrays. 
    //Each holding the name of the property and the value the particular ufo entry has for that property
    //inputs: priority algorithm configuration, and a ufo entry,  both of them ontology objects
    //ouput: [[status, open], [domain, repair], [Title, Fuselage Skin DE...], ....]
    @Function()
    public getPriorityValsForOneEntry(algoConfig : (string|undefined)[][], entry : Ufoentry) : (string|undefined)[][] {
        //find active configuration
        let configuration = algoConfig;
        let i = 0 ;
        let configVals = [];
        if (configuration !== undefined) {
            while (i < configuration[0].length) { //configuration[0]   is the array holding all the parameter fields ex: ['highestMessUrgency', 'RTS', 'Status']
                let val = configuration[0][i]; //ex: configuration[0][i] : 'RTS'
                let kvArr = [val];
                if ((configuration[0][i] !== (undefined )) && (val !== undefined)) {
                    // V2 forward-compatibility — if the parameter key was
                    // authored against the V2 (snake_case) naming, translate
                    // to the V1 equivalent the switch below already handles.
                    // V1 keys and unknown keys pass through unchanged.
                    const switchKey = toV1PriorityKey(configuration[0][i]);
                    switch(switchKey) {
                        //push the appropriate Entry data 
                        //some entry data (datetypes, booltypes, inttypes) need to be cast as a String
                        //      toString() doesnt accept parameters that might be null, so some of the switch cases have an if (!null) check before pushing
                        case "id_dossier":
                            kvArr.push(entry.idDossier);
                            break;
                        case "dossier_internal_id":
                            kvArr.push(entry.internalId);
                            break;
                        case "Domain":
                            kvArr.push(entry.domain);
                            break;
                        case "Title":
                            kvArr.push(entry.title);
                            break;
                        case "dossierLabel":
                            kvArr.push(entry.label);
                            break;
                        case "Channel":
                            kvArr.push(entry.channel);
                            break;
                        case "Dossier_isMigrated":
                            if(entry.isMigrated !== undefined) {
                                kvArr.push(entry.isMigrated.toString());
                            } 
                            else {
                                kvArr.push(entry.isMigrated);
                            }
                            break;
                        case "Status":
                            kvArr.push(entry.status);
                            break;
                        case "Program_Letter":
                            kvArr.push(entry.programLetter);
                            break;
                        case "Program":
                            kvArr.push(entry.program);
                            break;
                        case "AircraftID":
                            kvArr.push(entry.aircraftId);
                            break;
                        case "Skywise_AircraftID":
                            kvArr.push(entry.skywiseAircraftId);
                            break;
                        case "isapplicable_forAll_MSN":
                            if(entry.isappforAllMsn !== undefined) {
                                kvArr.push(entry.isappforAllMsn.toString());
                            } 
                            else {
                                kvArr.push(entry.isappforAllMsn);
                            }
                            break;
                        case "MSN":
                           if(entry.msn !== undefined) {
                                kvArr.push(entry.msn.toString());
                            } 
                            else {
                                kvArr.push(entry.msn);
                            }
                            break;
                        case "Aircraft_Type":
                            kvArr.push(entry.aircraftType);
                            break;
                        case "Aircraft_Model":
                            kvArr.push(entry.aircraftModel);
                            break;
                        case "Registration_Number":
                            kvArr.push(entry.regNumber);
                            break;
                        case "Aircraft_Flighthrs":
                            if(entry.craftFlighthrs !== undefined) {
                                kvArr.push(entry.craftFlighthrs.toString());
                            } 
                            else {
                                kvArr.push(entry.craftFlighthrs);
                            }
                            break;
                        case "Aircraft_Flightcycs":
                            if(entry.craftFlightcycs !== undefined) {
                                kvArr.push(entry.craftFlightcycs.toString());
                            } 
                            else {
                                kvArr.push(entry.craftFlightcycs);
                            }
                            break;
                        case "operator_ICAO":
                            kvArr.push(entry.operIcao);
                            break;
                        case "engineSeries":
                            kvArr.push(entry.engineSeries);
                            break;
                        case "engineModel":
                            kvArr.push(entry.engineModel);
                            break;
                        case "component_SerialNum":
                            kvArr.push(entry.compSerialNum);
                            break;
                        case "component_PartNum":
                            kvArr.push(entry.compPartNum);
                            break;
                        case "component_Flightcycs":
                            if(entry.compFlightcycs !== undefined) {
                                kvArr.push(entry.compFlightcycs.toString());
                            } 
                            else {
                                kvArr.push(entry.compFlightcycs);
                            }
                            break;
                        case  "component_FlightHrs":
                            if(entry.compFlightHrs !== undefined) {
                                kvArr.push(entry.compFlightHrs.toString());
                            } 
                            else {
                                kvArr.push(entry.compFlightHrs);
                            }
                            break;
                        case "component_FIN":
                            kvArr.push(entry.compFin);
                            break;
                        case "ata_Chapter":
                            if(entry.ataChap !== undefined) {
                                kvArr.push(entry.ataChap.toString());
                            } 
                            else {
                                kvArr.push(entry.ataChap);
                            }
                            break;
                        case "ata_4d":
                            if(entry.ata4d !== undefined) {
                                kvArr.push(entry.ata4d.toString());
                            } 
                            else {
                                kvArr.push(entry.ata4d);
                            }
                            break;
                        case "Dossier_Requestor_ICAO":
                            kvArr.push(entry.dossReqIcao);
                            break;
                        case "Dossier_VisbleBy_ICAO":
                            kvArr.push(entry.dossVisIcao);
                            break;
                        case "Dossier_CreationDate":
                            if(entry.dossCreDate !== undefined) {
                                kvArr.push(entry.dossCreDate.toISOString());
                            } 
                            else {
                                kvArr.push(entry.dossCreDate);
                            }
                            break;
                        case "Dossier_UpDate":
                            if(entry.dossUpDate !== undefined) {
                                kvArr.push(entry.dossUpDate.toISOString());
                            } 
                            else {
                                kvArr.push(entry.dossUpDate);
                            }
                            break;
                        case "Dossier_SubmitDate":
                            if(entry.dossSubDate !== undefined) {
                                kvArr.push(entry.dossSubDate.toISOString());
                            } 
                            else {
                                kvArr.push(entry.dossSubDate);
                            }
                            break;
                        case "Dossier_ClosureDate":
                            if(entry.dossClosDate !== undefined) {
                                kvArr.push(entry.dossClosDate.toISOString());
                            } 
                            else {
                                kvArr.push(entry.dossClosDate);
                            }
                            break;
                        case "nb_TotalMessages":
                            if(entry.nbTotalMess !== undefined) {
                                kvArr.push(entry.nbTotalMess.toString());
                            } 
                            else {
                                kvArr.push(entry.nbTotalMess);
                            }
                            break;
                        case "nb_ClosedMessages":
                            if(entry.nbClosedMess !== undefined) {
                                kvArr.push(entry.nbClosedMess.toString());
                            } 
                            else {
                                kvArr.push(entry.nbClosedMess);
                            }
                            break;
                        case  "Message_Soonest_ReqDate":
                        // by default, newRequestDate holds the same data that MessageSoonestRequestDate has 
                        // if a FSR updated newRequestDate, that value is what should be considedered in prioritization
                        // newRequestDate is what is considered in PrioritizationAlgorithm
                            if(entry.newRequestDate !== undefined) {
                                kvArr.push(entry.newRequestDate.toISOString());
                            } 
                            else {
                                kvArr.push(entry.newRequestDate);
                            }
                            break;
                        case "highest_Message_Urgency":
                            kvArr.push(entry.highestMessUrg);
                            break;
                        case "Message_Open":
                            if(entry.messOpen !== undefined) {
                                kvArr.push(entry.messOpen.toString());
                            } 
                            else {
                                kvArr.push(entry.messOpen);
                            }
                            break;
                        case "has_Approval_Doc":
                            if(entry.hasAppDoc !== undefined) {
                                kvArr.push(entry.hasAppDoc.toString());
                            } 
                            else {
                                kvArr.push(entry.hasAppDoc);
                            }
                            break;
                        case  "approval_doc_type":
                            kvArr.push(entry.appDocType);
                            break;
                        case "AircraftStatus":
                            kvArr.push(entry.aircraftStatus);
                            break;
                        case "Days_Since_MostRecentDossierAction":
                            // if(entry.daysSince !== undefined) {
                            //     kvArr.push(entry.daysSince.toString())
                            // } 
                            // else {
                            //     kvArr.push(entry.daysSince)
                            // }
                            break;
                        case "RTS":
                            if(entry.rts !== undefined) {
                                kvArr.push(entry.rts.toISOString());
                            } 
                            else {
                                kvArr.push(entry.rts);
                            }
                            break;
                            //tr status, msn rts, escalations
                        case "MSN RTS":
                            if(entry.msnRts !== undefined) {
                                kvArr.push(entry.msnRts.toISOString());

                            } 
                            else {
                                kvArr.push(entry.msnRts);
                            }
                            break;
                        case "TR Status":
                            kvArr.push(entry.trStatus);
                            break;
                        case "Escalations":
                            let count = 0; 
                            if (entry.customerEscalation){count ++;}
                            if (entry.internalEscalation){count ++;}
                            if (entry.partsEscalation){count ++;}
                            kvArr.push(count.toString());
                        break;

                    }
                configVals.push(kvArr);
                // at this point, kvArr (keyValur Array), should hold the parameter title and the entry value
                //      ex: ["priority'", 'Amber']
                }
                
                i++;
            }
        }
        // for loop to keep BlankParameters in standard format
        for (let arr of configVals) {if (arr.length < 2) {arr.push("-");}}
        return configVals
    }



//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//Functions for score calculation 

    //assigns weight and calls helper functinos to aggregate final priority global score 
    // inputs: array of string arrays holding values and property, (ouput of getPriorityValsForOneEntry())
    //      && array of string arrays holding the configuration values (output of configureAlgorithm())
    //output: integer value, representing global score 
    @Function()
    private calculateGlobalScore(vals:string[][], configuration : string[][], bump: Integer ) : Integer {
        let score = 0.0;
        let i = 0.0;
        configuration[0] = configuration[0].filter(item => (item !== '-'  ) && item !== undefined)
        configuration[0] = configuration[0].filter(item => (item !== 'BlankParameter'  ) && item !== undefined)
        // after this point configuration[0] will only hold parameters that are going to be scored
        //      no blankParameter or undefined parameters
        //configuration length tells how many parameters should be scored
        let n = configuration[0].length;
        //arithmetic series prvides the denominator for dynamic weighting
        //      if n = 2 : arithmeticSeries = 3
        //      if n = 3 : arithmeticSeries = 6
        //      if n = 4 : arithmeticSeries = 10
        //      ...
        //      if n = 10 : arithmeticSeries = 55
        let arithmeticSeries = (n * (n+1))/2;
        // i represents the numerator for dynamicc weighting 
        while (i < n) {
            if (vals[i][0]!== undefined) {
                // weight diminishes for each property
                // ex: 
                //      length = 4
                //      arithmetic series = 10 
                //      n = 4, i = 0  (i is incremented every loop)
                //      weights are: n-i/10 --? 4/10, 3/10, 2/10, 1/10 
                //      weights are decreasing so first prarmeter is most important 
                //      weights sum to 10/10
                let weight = (n - i) /arithmeticSeries ;
                //determine the score along this particular property
                //using calculatePropertyScore() helper function
                let  paramScore = this.calculatePropertyScore(configuration[i+1], vals[i]);
                //multiply by weight 
                paramScore = paramScore*weight;
                //add to score
                score += paramScore;
            }
            i++; 
        }
        score = Math.round(score) + bump;
        return score; 
    }
    // calculates the exact score for one property. Different procedures for score depending on nature of property 
    //inputs: string array of the property, priority configuration (one of the arrays in the return of configureAlgorithm())
    //  & propAndVal, two value aray holding the property title of the ufo entry and the value of a prticaulr ufo entry along that paroperty 
    //ouput is in integer, scored out of 100
    @Function()
    private calculatePropertyScore(parameterConfig: string[], propAndVal: string[]) : Integer {
        parameterConfig = parameterConfig.filter(item => item !== undefined);
        parameterConfig = this.removeDashesAndCondense(parameterConfig);
        if ((propAndVal[1] === 'No Value') || (propAndVal[1]===undefined)) {
            return 0;
        }
        let retScore = 0;
        // types of parameters are defined here
        let exact_Matches = ["Domain", "Channel", "Program_Letter", "Program", "AircraftID", "Skywise_AircraftID" , "MSN", "Aircraft_Type", "Aircraft_Model", "operator_ICAO",
                            "engineSeries", "engineModel","component_SerialNum", "component_PartNum", "component_FIN","ata_Chapter", "ata_4d", "Dossier_Requestor_ICAO",
                            "Dossier_VisbleBy_ICAO", "approval_doc_type","Registration_Number"];
        let spans = [ "Aircraft_Flighthrs","Aircraft_Flightcycs","component_Flightcycs", "component_FlightHrs",  
                        "nb_TotalMessages","nb_ClosedMessages", "Days_Since_MostRecentDossierAction"];
        let dates = ["Dossier_CreationDate", "Dossier_UpDate", "Dossier_SubmitDate", "Dossier_ClosureDate","Message_Soonest_ReqDate", "RTS", "MSN RTS"];
        let binaryMatches = ["Dossier_isMigrated", "Status", "isapplicable_forAll_MSN","Message_Open", "has_Approval_Doc", "approval_doc_type"];
        let keywords = ["Title"];
        // priority is automatically configurered here 
        if (propAndVal[0] === "Priority") {
            if(propAndVal[1] === "Amber") {
                retScore = 50
            }
            else if (propAndVal[1] ==="Red")  {
                retScore = 100
            }
            else {
                retScore = 0 
            }
        }
        //message Urgency is automatically configured here
        else if (propAndVal[0] === "highest_Message_Urgency") {
            if(propAndVal[1] === "Regular") {
                retScore = 25;
            }
            else if(propAndVal[1] === "Critical") {
                retScore = 50;
            }
            else if(propAndVal[1] === "High") {
                retScore = 75;
            }
            else if (propAndVal[1] ==="AOG")  {
                retScore = 100;
            }
            else {
                retScore = 0 
            }
        }
        // aircraftStatus is automatically configured here 
        else if (propAndVal[0] === "AircraftStatus") {
            if(propAndVal[1] === "AOG") {
                retScore = 100;
            }
            else if (propAndVal[1] === "Heavy Maintenance WSP")  {
                retScore = 67;
            }
            else if (propAndVal[1] === "Heavy Maintenance Visit") {
                retScore = 33;
            }
            else {
                retScore = 0 ;
            }
        }
        else if (propAndVal[0] === "Escalations") {
            let mult = Number(propAndVal[1]);
            retScore = mult*33;
        }
        else if (propAndVal[0] === "TR Status") {
            switch(propAndVal[1]) {
                case "At Customer":
                    retScore = 100;
                    break;
                case "Interim to Definitive":
                    retScore = 85.5 ;
                    break;
                case "To Be Assigned":
                    retScore = 71.25;
                    break;
                case "At DO for Justif":
                    retScore = 57 ;
                    break;
                case "At DO for Repair":
                    retScore = 42.75 ;
                    break;
                case "At DOA":
                    retScore = 28.5  ;
                    break;
                case "RDAF Approved":
                    retScore = 14.25  ;
                    break;
                case "Completed":
                    retScore = 0;
                    break;

            }
        }
        else if (exact_Matches.includes(propAndVal[0])) { //exact match  parameters (ex: aircraft family) 
            //interval defines how much each tier of a parameter should be worth 
            //ex: configuration only has two values in its definition, ['DAL','AAL'], DAL should score 100 and AAL should score 50
            //      if it had 5 values, ['DAL', 'AAL', 'FFT', 'JBU', 'HAL'], scores should be 100, 80, 60, 40, 20, 0
            let interval = (100 / parameterConfig.length);
            let index = parameterConfig.indexOf(propAndVal[1]);
            if (index !== -1) {
               retScore = 100 - (index *interval)
            } 
            else {
                retScore = 0
            }
        }
        else if (binaryMatches.includes(propAndVal[0])) { //boolean parameters (hasRDAF)
            if ((propAndVal[1]) === parameterConfig[0]) {
                retScore = 100;
            }
        }
        else if (spans.includes(propAndVal[0])){ //number value parameters (flight cycles)
            let val = propAndVal[1];
            
            if(parameterConfig[2] === "span") {
                let bounds = [parameterConfig[0], parameterConfig[1]];
                retScore = this.spanorBlock(val,bounds,true )
            } else {
                retScore = this.spanorBlock(val, parameterConfig, true)
            }
           
           
        }
        else if (dates.includes(propAndVal[0])){ //date parameters (soonest request date)
            let days = this.isoStringtoDaysSince(propAndVal[1]);
            let val =propAndVal[1];
            if(parameterConfig[2] === "span") {               
                let max = Number (parameterConfig[0])
                let min = Number (parameterConfig[1]);
                if (min < 0) {
                    //noramlizes data for the case of a negeative date range 
                    //ex:  if min is -365 ( 365 days past, one year ago) and max is 7 ( one week into the future),
                            // we want -364 scored the highest and 6 scored the lowest
                    //this normalizes the data for the spanorBlock() helper function 
                    let  range = max - min;
                    days = days - min;
                    days = range - days; 
                    max = range
                    min = 0;
                }
                let daysFunc = days.toString()
                let maxFunc = max.toString()
                let minFunc = min.toString()
                let bounds = [maxFunc, minFunc];
                

                retScore = this.spanorBlock(daysFunc, bounds,true )
            } else {
                let valfunc= this.isoStringtoDaysSince(val).toString();

                retScore = this.spanorBlock(valfunc,parameterConfig, false)
            }
        }
        else if (keywords.includes(propAndVal[0])) { //keyword parameters (title)
            let interval = (100 / parameterConfig.length);
            let found = false;
            for (let i = 0; i < parameterConfig.length; i++) {
                if (propAndVal[1].includes(parameterConfig[i])){
                    retScore = 100 - (i *interval)
                    found = true;
                }
            } if (!found){
                retScore = 0;
            }
        }
        return retScore;
    }






//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//Priority Helper Functions 

    private spanorBlock(value: string, bound : string[], spanTrueblockFalse: boolean) : Integer {
        bound = this.removeDashesAndCondense(bound);
        let bounds = this.sort(bound, true)
        if (spanTrueblockFalse) {
            let max = bounds[0];
            let min = bounds[1];
            let val = (parseInt(value));
            if (val <= min){
                return 0;
            }
            else if (val >= max) {
                return 100;
            }
            else {
                let span = max - min;
                let valNormalized = val - min;
                let score = (valNormalized /span) * 100;
                return score;
            } 
        } else {
            let  index = 0;
            for(let i = 0; i <bounds.length; i ++) {
                if (parseInt(value) <= bounds[i]) {
                    index = i;
                    i = bounds.length; 
                } else {
                    if ( i === (bounds.length - 1)){
                        index = i +1;
                    } else {
                        i++;
                    }
                
                }
            }      
           let  retScore = 100 - (index * (100/bounds.length));
           return retScore;
        }
        
        

    }
    //max and min are asynchronous functions so the awaits ensure that actual values, and not js promies objects, are passed through
    @Function()
    private async findBounds(property: (string| undefined), entries : ObjectSet<Ufoentry>): Promise<string[]> {
        let max = 0; 
        let min = 0;
        if(property !== undefined) {
            let maxDate;
            let minDate;
            switch(property) {
                //push the appropriate Entry data 
                case "Days_Since_MostRecentDossierAction":
                    // max  = Number (await (entries.max(item=>item.daysSince)));
                    // min =  Number (await (entries.min(item=>item.daysSince)));
                    break;
                case "Dossier_ClosureDate":
                    maxDate = await (entries.max(item=>item.dossClosDate))
                    if(maxDate?.toISOString()!== undefined) { max = this.isoStringtoDaysSince(maxDate?.toISOString())}
                    minDate = await (entries.min(item=>item.dossClosDate))
                    if(minDate?.toISOString()!== undefined) { min = this.isoStringtoDaysSince(minDate?.toISOString())}
                    break;
                case "Dossier_CreationDate":
                    maxDate = await (entries.max(item=>item.dossCreDate))
                    if(maxDate?.toISOString()!== undefined) { max = this.isoStringtoDaysSince(maxDate?.toISOString())}
                    minDate = await (entries.min(item=>item.dossCreDate))
                    if(minDate?.toISOString()!== undefined) { min = this.isoStringtoDaysSince(minDate?.toISOString())}
                   break;
                case "Dossier_SubmitDate":
                    maxDate = await (entries.max(item=>item.dossSubDate))
                    if(maxDate?.toISOString()!== undefined) { max = this.isoStringtoDaysSince(maxDate?.toISOString())}
                    minDate = await (entries.min(item=>item.dossSubDate))
                    if(minDate?.toISOString()!== undefined) { min = this.isoStringtoDaysSince(minDate?.toISOString())}
                   break
                case "Dossier_UpDate":
                    maxDate = await (entries.max(item=>item.dossUpDate))
                    if(maxDate?.toISOString()!== undefined) { max = this.isoStringtoDaysSince(maxDate?.toISOString())}
                    minDate = await (entries.min(item=>item.dossUpDate))
                    if(minDate?.toISOString()!== undefined) { min = this.isoStringtoDaysSince(minDate?.toISOString())}
                    break
                case "Message_Soonest_ReqDate":
                    maxDate = await (entries.max(item=>item.newRequestDate))
                    if(maxDate?.toISOString()!== undefined) { max = this.isoStringtoDaysSince(maxDate?.toISOString())}
                    minDate = await (entries.min(item=>item.newRequestDate))
                    if(minDate?.toISOString()!== undefined) { min = this.isoStringtoDaysSince(minDate?.toISOString())}
                    break;
                case "RTS":
                    maxDate = await (entries.max(item=>item.rts))
                    if(maxDate?.toISOString()!== undefined) { max = this.isoStringtoDaysSince(maxDate?.toISOString())}
                    minDate = await (entries.min(item=>item.rts))
                    if(minDate?.toISOString()!== undefined) { min = this.isoStringtoDaysSince(minDate?.toISOString())}
                   break;
                case "MSN RTS":
                    maxDate = await (entries.max(item=>item.msnRts))
                    if(maxDate?.toISOString()!== undefined) { max = this.isoStringtoDaysSince(maxDate?.toISOString())}
                    minDate = await (entries.min(item=>item.msnRts))
                    if(minDate?.toISOString()!== undefined) { min = this.isoStringtoDaysSince(minDate?.toISOString())}
                   break;

            } }
        let retArr = await [max.toString(), min.toString()]
        return retArr
    }

    //converts DateType to a string
    @Function()
    private isoStringtoDaysSince(isoString : string): Integer {
            let date = LocalDate.fromISOString(isoString);
            let today = LocalDate.now();
            let milliseconds = date.valueOf() - today.valueOf();
            let seconds = milliseconds /1000;
            let minutes = seconds/60;
            let hours  = minutes/ 60; 
            let days = hours/ 24;  
            return days
        
    }
    //takes an array, removes dashes and sorts in in descending order 
    //called when parameter being read is analyzed along a span of integer values 
    //input: string array
    //output: sorted, cleaned, and condensed array of integers 
    @Function()
    private removeDashesAndCondense(arr: string []) :string[] {
        const nonDashValues = arr.filter(item => item !== '-');
        const condensedArray = [];
        let lastNonDashIndex = -1;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] !== '-') {
            lastNonDashIndex++;
            condensedArray[lastNonDashIndex] = arr[i];
            }
        }
        return condensedArray;

    }
    @Function()
    private sort(arr: string [], descending: boolean) :Integer[] {
        const retArray = [];
        for (let i = 0; i < arr.length; i++) {
            retArray[i] = parseInt(arr[i], 10);
            }
        if (descending){retArray.sort((a, b) => (b - a));}
        else {retArray.sort((a, b) => (a - b));}
        return retArray;
    }


    @OntologyEditFunction()
    public async batchDriver(entries:ObjectSet<Ufoentry>, drivenEntries:ObjectSet<Ufoentry>): Promise<void> {
        let comments = entries.all().filter(item => (item.comment_storedAction !== undefined) && (item.comment_storedAction.length > 0));
        let fsrInput = entries.all().filter(item => (item.fsrentry_storedAction !== undefined) && (item.fsrentry_storedAction.length > 0));
        for (let c = 0; c < comments.length; c++) {
            this.executeStoredComment(comments[c]);
        
        }
        for (let f = 0; f < fsrInput.length; f++) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.executeStoredFSREntry(fsrInput[f], drivenEntries);
        }
    }

    @OntologyEditFunction()
    public clearStoredActions(entriesParam: ObjectSet<Ufoentry>, clearComments: boolean, clearFSREntry:boolean): void {
        let entries = entriesParam.all();
        for (let i = 0; i < entries.length; i++) {
            if (clearFSREntry) {entries[i].fsrentry_storedAction = undefined;}
            if (clearComments) {entries[i].comment_storedAction = undefined;}
            
        }
    }

    public executeStoredFSREntry(entry: Ufoentry, entries: ObjectSet<Ufoentry>): void {
        if (entry.fsrentry_storedAction !== undefined) {
            let acStatus = entry.fsrentry_storedAction[1];
            let focal = entry.fsrentry_storedAction[2];
            let newRqDate = this.getDateArray(entry.fsrentry_storedAction[3]);
            let rts= this.getDateArray(entry.fsrentry_storedAction[4]);
            
            let intEsc = entry.fsrentry_storedAction[5].toUpperCase().includes("INTERNAL");
            let custEsc = entry.fsrentry_storedAction[5].toUpperCase().includes("CUSTOMER");
            let partsEsc = entry.fsrentry_storedAction[5].toUpperCase().includes("PARTS");
            let trStatus = entry.fsrentry_storedAction[6];
            let name = entry.fsrentry_storedAction[7];
            let msnIdsParam = entry.fsrentry_storedAction[8];
            let msnIds = ["x"];
            if (msnIdsParam !== undefined) {msnIds = entry.fsrentry_storedAction[8].split('-').filter(part => part !== "");}
            //let msnIds = entry.fsrentry_storedAction[8].split('-').filter(part => part !== "");

            let msnLinkedEntries = Objects.search().ufoentry().filter(e => Filters.or(e.idDossier.exactMatch(... msnIds)));
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.fsrEntryDriver(entry, acStatus, focal, newRqDate, rts, [], entries ,intEsc, custEsc, partsEsc, trStatus, msnLinkedEntries , name);
        }
    }

    public executeStoredComment(entry: Ufoentry) :void {
        if (entry.comment_storedAction !== undefined) {
            for (let i = 0; i < entry.comment_storedAction.length / 6; i ++) {  
                let comment = entry.comment_storedAction[(1 + i *6)];
                let link = (entry.comment_storedAction[(2 + i *6)] === "true");
                let msnIdsParam = entry.comment_storedAction[(3 + i *6)];
                let msnIds = [''];
                if (msnIdsParam !== undefined) {msnIds = entry.comment_storedAction[(3 + i *6)].split('-').filter(part => part !== "");}
                let code = entry.comment_storedAction[(4 + i *6)];
                let name = entry.comment_storedAction[(5 + i *6)];
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                //addCommentstoUFOEntry(entry, comment, link, msnIds, code, name);
            }
            entry.comment_storedAction = undefined;
        }
       
        
    }

    public getDateArray(dateString: string): LocalDate[] {
        if (dateString === '') {
            return [];
        }
        const date = LocalDate.fromISOString(dateString); // expects 'yyyy-MM-dd'
        return [date];
    }

    @OntologyEditFunction()
    public setStoredComment(entry: Ufoentry, comment :string,  link: string, ids: string[], commentCode: string, name:string ) : void{
        var arr;
        if ((entry.comment_storedAction === undefined) || (entry.comment_storedAction.length === 0)){
            arr  = new Array<string>; 
        } else {
            arr = [... entry.comment_storedAction]
        }
        let len = arr.length;
        if (entry.idDossier === undefined) {return;}
        arr[0 + len] = entry.idDossier;
        arr[1 + len] = comment; 
        arr[2 + len] = link; 
        arr[3 + len] = ids.toString();
        arr[4 + len] = commentCode; 
        arr[5 + len] = name;
        entry.comment_storedAction = arr;
    }

    @OntologyEditFunction()
    public setStoredFSREntry(entry: Ufoentry, acStatus : string, focal: string, newRqDate: LocalDate[], rts: LocalDate[], interEsc: boolean, 
                            partsEsc: boolean, custEsc: boolean, trStatusUpdate: string, user: string, msnIDS: ObjectSet<Ufoentry> ) :void {
        let arr = new Array<string>;
        if (entry.idDossier === undefined) {return;}
        arr[0] = entry.idDossier;
        arr[1] = acStatus; 
        arr[2] = focal; 
        if (newRqDate.length > 0) {arr[3] = newRqDate[0].toISOString();} 
        else {arr[3] = "" }
        if (rts.length > 0) {arr[4] = rts[0].toISOString();} 
        else {arr[4] = "" }
        
        // arr[4] = rts.toLocaleString(); 
        let esc = ""
        if(interEsc) {esc = esc.concat("-InternalEscalation");}
        if(partsEsc) {esc = esc.concat("-PartsEscalation");}
        if(custEsc) {esc  = esc.concat("-CustomerEscalation");}
        arr[5] = esc;
        arr[6] = trStatusUpdate;
        arr[7] = user; 
        let msns = "";
        msnIDS.all().forEach(m =>  {
            if (m.idDossier !== undefined) {
                msns = msns.concat("-").concat(m.idDossier);
        } })
        arr[8] = msns;
        entry.fsrentry_storedAction = arr;
                            
    }

   
   
    
    

    



//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Non Prioritizaion Functions

    //used in Dashboard to select 25 highest priority scores for export function
    @Function()
    public sortAndTruncate(entries:ObjectSet<Ufoentry>):Ufoentry[] {
        let x = entries.orderBy(e => e.globalPriorityScore.desc());
        let y = x.take(25);

        return y;
    }
    
    @Function()
    public returnIndex(icaos: string [], icao: string, boolArray: boolean []): boolean {
        return boolArray[icaos.indexOf(icao)]; 
    }

    
    //sets a PriorityAlgorithm as the active algorithm (1)
    //sets all other PriorityAlgorithm as non active (0)
    @OntologyEditFunction()
    public setMainConfig(algo: PriorityAlgorithm, configurations: ObjectSet<PriorityAlgorithm>) :void {
        let arr = Objects.search().priorityAlgorithm().all();
        for (let i = 0; i < configurations.all().length; i++){ 
            let x  = 0;
            configurations.all()[i].mainConfigFlag = x;
        }
        let y  = 1;
        algo.mainConfigFlag = y; 
    }

    //counts every operatorICAO from entriesParam 
    //sets the counts for ICAO objects defiend in icaos parameter 
    //      counts are RedCount, AmberCount, AmberCap (dynamically determined)
    @OntologyEditFunction()
    public calculateCountsforICAOS(icaos: string[], entriesParam: ObjectSet<Ufoentry> ) :void {
        //redCap is 3 but defined as 2 so the boolean function can check if redCount > redCap 
        const redCap = 2;
        let icaoObjectLoadin = Objects.search().ufoICAO().all();
        let entries = entriesParam.all();
        let icaoObjects= new Array;
        for (let i = 0; i < icaos.length; i++) {
            let undefinedIcaos = 0; 
            icaos[i] = icaos[i].replace('[', '');
            icaos[i] = icaos[i].replace(']', '');
            let openEntries = entries.filter(item => ((item.operIcao === icaos[i]) && (item.status === "OPEN")));
            let closedEntries = entries.filter(item => ((item.operIcao === icaos[i]) && (item.status === "CLSD")));
            let correspondingObject = icaoObjectLoadin.filter(item => item.icao === icaos[i]).at(0);
            if ((correspondingObject !== undefined) ){
                correspondingObject.opencount = openEntries.length;
                correspondingObject.closedCount = closedEntries.length;
               // correspondingObject.amberCount = amberEntries.length; 
                correspondingObject.ambersAlloted = (Math.round((openEntries.length /10))) - 1;
              
            } else {
                undefinedIcaos += 1;
            }
        }
    }
    

    // lets end user delete multiple UFOentries in one action 
    // should be put on an Automated Schedule
    @OntologyEditFunction()
    public deleteMultiple(entries: ObjectSet<Ufoentry>) : void {
        let len = entries.all().length;
        for (let i = 0; i < len; i++) {
            entries.all().at(0)?.delete();
        }
    }


    // when FSR makes an edit to a ufoEntry( priority change, new RequestDate, etc), priority score and ICAO counts should be recaculated
    @OntologyEditFunction() 
    public async fsrEntryDriver(entry : Ufoentry, acStatus : string, focal: string, 
                            newRqDate: LocalDate[], rts: LocalDate[], icaos: string[], entries : ObjectSet<Ufoentry>, 
                            interEsc: boolean, partsEsc: boolean, custEsc: boolean, trStatusUpdate: string,
                            msnIDS: ObjectSet<Ufoentry>, user: string) : Promise<void> {
        let fsrTeam = Objects.search().fsrteam().all().filter(f => f.operator === entry.operIcao)[0];
        if (fsrTeam !== undefined) {
            let arr = (fsrTeam.watchList ?? [])
            fsrTeam.watchList = [...arr, entry.newProperty3];
        }
       // if (priority !== undefined){entry.priority = priority;}
        if (acStatus !== "None"){entry.aircraftStatus = acStatus;}
        if (focal !== "None"){entry.focal = focal;}
        if (newRqDate[0] !== undefined) {entry.newRequestDate = newRqDate[0];}
        if (rts[0] !== undefined) {
            entry.rts = rts[0];
            this.updatelatestRts(entry, rts[0], msnIDS)
            }
        if (interEsc === undefined){ interEsc = false;}
        if (custEsc === undefined){ interEsc = false;} 
        if (partsEsc === undefined){ interEsc = false;} 
        if (trStatusUpdate !== "None") {entry.trStatus = trStatusUpdate;}
            
        this.escalate(custEsc, partsEsc, interEsc, entry, user);
       // this.calculateCountsforICAOS(icaos, entries);
        await this.calculateOneEntryScore(entry, entries);

    }

    // marks userClosed entries as actually closed when Back Office closes them
    @OntologyEditFunction()
    public updateClosed(entriesParam: ObjectSet<Ufoentry>): void {
        let entries = entriesParam.all();
        for (let i = 0; i < entries.length; i ++) {
            if (entries[i].closedbyBackOffice === true){
                entries[i].status = "CLSD";
            }

        }
    }

    @OntologyEditFunction()
    public updatelatestRts(entry: Ufoentry, rts:LocalDate, idsParam : ObjectSet<Ufoentry>) :void {
        let entries = idsParam.all(); 
        let currDate = entry.msnRts;
        if (currDate === undefined) {
            entry.msnRts = rts;
            for (let it = 0; it < entries.length; it ++) {
                entries[it].msnRts = rts;
            } 
        } else {
            let max = rts;
            for (let i = 0; i < entries.length; i ++) {
                let interVal = entries[i].rts;
                 if (interVal !== undefined) {
                      if (interVal > max ) {
                          max = interVal
                    }  }    
            }
            entry.msnRts = max;
            for (let i = 0; i < entries.length; i ++) {
                entries[i].msnRts = rts;
            }  }
    }
    
  
    @OntologyEditFunction()
    public setSharedProperties(entriesParam: ObjectSet<Ufoentry>) : void {
        let entries = entriesParam.all();    
        for (let i = 0; i < entries.length; i ++) {
            let linkedObject = entries[i].inferRepairDossierStatus.get();
            if(linkedObject !== undefined) {
                entries[i].trStatus = linkedObject.computedStatus;
                
                entries[i].status = linkedObject.dossierStatus;
                if (linkedObject.dossierStatus !== undefined && linkedObject.dossierStatus.includes("OPEN")) {
                    entries[i].status = "OPEN";
                }
                else if (linkedObject.dossierStatus !== undefined && linkedObject.dossierStatus.includes("CLSD")) {
                    entries[i].status = "CLSD";
                }
                entries[i].dossUpDate = linkedObject.dossierUpdateDate;
                entries[i].dossSubDate = linkedObject.dossierSubmitDate;
                entries[i].dossClosDate = linkedObject.dossierClosureDate;
                entries[i].mostRecentAction = linkedObject.dossierUpdateDate;
                //entries[i].nbTotalMess;
            }
            
        }
    }

    @OntologyEditFunction()
    public escalate(customerEsc: boolean, partsEsc: boolean,  interEsc: boolean, entry: Ufoentry, user:string) :void {
        let esc = "";
        let call = false;
        if (customerEsc && !entry.customerEscalation){
            entry.cusEscDate = Timestamp.now();
            entry.customerEscalation = true;
            entry.customerEscalationByUser = user;
            esc = "Customer Escalation";
            call = true;
            this.createEscalationObject(entry, esc, user);
        }
        if (interEsc && !entry.internalEscalation){
            entry.intEscDate = Timestamp.now();
            entry.internalEscalation = true;
            entry.internalEscalationByUser = user;
            esc = "Internal Escalation";
            call = true;
            this.createEscalationObject(entry, esc, user);
        }
        if (partsEsc && !entry.partsEscalation){
            entry.partsEscDate = Timestamp.now();
            entry.partsEscalation = true; 
            entry.partsEscalationByUser = user;
            esc = "Parts Escalation";
            call = true;
            this.createEscalationObject(entry, esc, user);
        }
        // if (call) {
        // this.createEscalationObject(entry, esc, user);}
    }

    @OntologyEditFunction()
    public statsandFocal (entriesParam: ObjectSet<Ufoentry>) : void {
        var entries = entriesParam.all();
        for (let i = 0; i < entries.length; i ++ ) {
            var entry = entries[1];
            if (entry.aircraftStatus === "No Value") {
                entry.aircraftStatus = undefined;
            }
            if (entry.focal === "No Value") {
                entry.focal = undefined;
            }
        }
    }



    public getNthIndexOf(str: string, char: string, n: number): number {
        let currentIndex = -1;
        
        for (let i = 0; i < n; i++) {
            currentIndex = str.indexOf(char, currentIndex + 1);
            if (currentIndex === -1) {
            break;
            }
        }
        return currentIndex;
    }



    @OntologyEditFunction() 
    public msn_rts (entriesParam: ObjectSet<Ufoentry>) : void{
        let entries = entriesParam.all();
        for (let i = 0; i < entries.length; i++) {
            
        }
    }

    @OntologyEditFunction() 
    public deEscalate(entry: Ufoentry, esc: string, closeTrueUndoFalse: boolean) : void {
        let existingEsc = Objects.search().ufoescalation().all().filter((item => item.dossierId === entry.newProperty3));
        if(esc === "Customer Escalation"){
            if (!closeTrueUndoFalse){//make new object}
                existingEsc = existingEsc.filter(item => item.escalationType === "Customer");
                let prevCount = existingEsc.length;
                let name = entry.idDossier + "-" + String(prevCount) +"-"+ "C";
                let escObject = existingEsc.filter(item => item.uniqueId === name);
                
                escObject[0].delete();
                
            }
            entry.customerEscalation = false;
            entry.cusEscDate = undefined;
            entry.customerEscalationByUser = undefined;
            }
        else if (esc === "Internal Escalation") {
            if (!closeTrueUndoFalse){
                existingEsc = existingEsc.filter(item => item.escalationType === "Internal");
                let prevCount = existingEsc.length;
                let name = entry.idDossier + "-" + String(prevCount) + "-"+"I";
                let escObject = existingEsc.filter(item => item.uniqueId === name) [0];
                escObject.delete();
            }

            entry.internalEscalation = false;
            entry.intEscDate = undefined;
            entry.internalEscalationByUser = undefined;
            
        }
        else if (esc === "Parts Escalation"){
            if (!closeTrueUndoFalse){
                existingEsc = existingEsc.filter(item => item.escalationType === "Parts");
                let prevCount = existingEsc.length;
                let name = entry.idDossier + "-" + String(prevCount) +"-"+ "P";
                let escObject = existingEsc.filter(item => item.uniqueId === name) [0];
                escObject.delete();
                
        }
            entry.partsEscalation = false;
            entry.partsEscDate = undefined; 
            entry.partsEscalationByUser = undefined;
            

        }
    
    }


    @OntologyEditFunction()
    public createEscalationObject(entry: Ufoentry, esc: string, user:string) : void{
        let entryNb = entry.newProperty3;
        let name = "error";
        let date = LocalDate.now();
        let escType = "error";
        let icao = entry.operIcao;
        let existingEsc = Objects.search().ufoescalation().all().filter((item => item.dossierId === entry.newProperty3));
        if(esc === "Customer Escalation"){
            existingEsc = existingEsc.filter(item => item.escalationType === "Customer");
            let prevCount = existingEsc.length;
            name = entry.idDossier + "-" + String(prevCount + 1) + "-" + "C";
            escType = "Customer";
        }
        if(esc === "Internal Escalation"){
            existingEsc = existingEsc.filter(item => item.escalationType === "Internal");
            let prevCount = existingEsc.length;
            name = entry.idDossier + "-" + String(prevCount + 1) + "-" + "I";
            escType = "Internal";
        }
        if(esc === "Parts Escalation"){
            existingEsc = existingEsc.filter(item => item.escalationType === "Parts");
            let prevCount = existingEsc.length;
            name = entry.idDossier + "-" + String(prevCount + 1) + "-" + "P";
            escType = "Parts";
        }
        let escObject = Objects.create().ufoescalation(name);
        escObject.escalationType = escType;
        escObject.dossierId = entryNb;
        escObject.icao = icao;
        escObject.escalationRasisedDate = date;
        escObject.user = user;
    }


    // @OntologyEditFunction() 
    // public stateMachine(entry: UfopathObject) : void {
    //     let pathFunc = new PathSupp();
    //     pathFunc.stateMachineDriver(entry);
    // }


    // @Function()
    // public newCommentBreakdown (entriesParam : ObjectSet<Ufoentry>, fsr: UfoFsr) : FunctionsMap<Ufoentry, string|undefined> {
    //     return Comments.

    // }
}

 
