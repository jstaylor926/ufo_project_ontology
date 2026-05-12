import { Function, MandatoryMarkingPropertyBaseType, Static } from "@foundry/functions-api" 

import {Integer,  LocalDate, Edits, OntologyEditFunction, isTimestamp, Timestamp, FunctionsMap, Filters} from "@foundry/functions-api";
import { Objects,  ObjectSet, Ufoentry, UfopathObject, PriorityAlgorithm, UfoICAO, UfoFsr} from "@foundry/ontology-api";
//import { PathSupp } from "./PathSupp";

export class FSRFunctions { 

    /*
    Scan And Delete:
        UFO compliance requires that the list of accessing users be regularly updated. 
        This function deletes FSR users if they haven't accessed UFO in a year. 
    */
    @OntologyEditFunction()
    public scanandDelete() :void {
        let fsrs = Objects.search().ufoFsr().all();
        const oneYearMs = 365 * 24 * 60 * 60 * 1000;

        fsrs.forEach(f =>{
            if (f.currentLogIn ===  undefined) {
                f.currentLogIn = Timestamp.now();
            }
            else {
                if ((f.currentLogIn.valueOf() - Timestamp.now().valueOf())  > oneYearMs) {
                    f.delete();
                }
            }
        })
    }



    /*
    Scenario FSR Match
        every UFOentry has an isFavorite field. 
        this pair of functions change a UFOentry.isFavorite to true based off of FSR favorites field 
        used in a Scenario context so it doesn't actually change the value, only exists within the dashboard
        The Dashboard the Function() 'scenarioDriverandReturnFSRFav', which calls 'scenarioFSRMatch'
    */
    @OntologyEditFunction()
    public scenarioFSRMatch(fsr :UfoFsr, entriesParam: ObjectSet<Ufoentry>) : void {
        let entries = entriesParam.all();
        let keys = fsr.favorites;
        let filtered = entries.filter(item => ((item.idDossier !== undefined) && (keys?.includes(item.idDossier))))
        for (let i = 0; i < filtered.length; i++) {
            filtered[i].isFavorite = true; 
        }
    }
    @Function()
    public scenarioDriverandReturnFSRFav (fsr: UfoFsr, entriesParam: ObjectSet<Ufoentry>) : Ufoentry[] {
        this.scenarioFSRMatch(fsr, entriesParam) ;
        let favs = entriesParam.all().filter(item => item.isFavorite);
        return favs;
    }

    
    
    /*
    Add/Remove And Update FSR Favs 
        This pair of functions manages the favorites for an FSR object 
        Simply adds or removes a string from the string array held in fsr.favorites
        These strings are then linked to UFOentries in the Scenario FSR Match functions above. 
    */
    @OntologyEditFunction()
    public addAndupdateFSRFavs(fsr: UfoFsr, entriestoAdd: ObjectSet<Ufoentry>) : void {
         let entries = entriestoAdd.all();
         let newArray = [""];
         if (fsr.favorites === undefined) {
             for (let i = 0; i < entries.length; i++) {
                 let id = entries[i].idDossier;
                 if (id !== undefined) {
                      newArray[i] = id;
                 }
                
             }
             fsr.favorites = newArray;
         }
         else {
            let currFavorites = fsr.favorites;
            for (let i = 0; i < currFavorites.length; i++) {
                let id = fsr.favorites?.at(i);
                if (id !== undefined) {
                    newArray[i] = currFavorites[i];
                }
            }
            for (let i2 = 0; i2 < entries.length; i2 ++) {
                let id = entries[i2].idDossier;

                if (id !== undefined) {
                    if (!(newArray.includes(id))) { newArray.push(id)}
                }
                
            }
            fsr.favorites = newArray;
         }


    }   

    @OntologyEditFunction()
    public removeAndupdateFSRFavs(fsr: UfoFsr, entriestoRemove: ObjectSet<Ufoentry>) : void {
         let entries = entriestoRemove.all();
         for (let i = 0; i <  entries.length; i ++) {
            let id = entries[i].idDossier;
            if (id === undefined) {id = "-";}
            let index = fsr.favorites?.indexOf(id);
            if (index !== undefined) {
                let newArray = [""];
                let holderOne = fsr.favorites?.slice(0, index);
                if (holderOne !== undefined) {
                    newArray = holderOne;
                }
                let holderTwo = fsr.favorites?.slice(index+1)
                if (holderTwo !== undefined) {
                    newArray = newArray.concat(holderTwo)
                }
                fsr.favorites = newArray;
            }
         }
    } 


}