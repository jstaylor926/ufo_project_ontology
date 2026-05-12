import {Integer,  LocalDate, Function,Edits, OntologyEditFunction, isTimestamp, Timestamp, FunctionsMap, Filters} from "@foundry/functions-api";
import { Objects, Fsrteam,  ObjectSet, Ufoentry, UfopathObject, PriorityAlgorithm, UfoICAO, UfoFsr} from "@foundry/ontology-api";

export class FsrTeam { 
    
    /*
    */
    @OntologyEditFunction()
    public setTeamMembers(team: Fsrteam) : void {
        let oper = team.operator;
        let names = Objects.search().ufoFsr().all().filter(f => {
            console.log(f.fsrteam)
            f.fsrteam === oper});
        let arr : string [] = [];
        for (let i = 0; i < names.length; i ++) {
            arr = arr.concat(names[i].name);
        }   
        team.fsrs = arr;
    }

    // @OntologyEditFunction()
    // public addToActionLog(fsr: UfoFsr) :void {
    //     let team = fsr.fsrteamObject.get();
    //     let struct = {
    //         FSR : fsr.name, 
    //         Time: Date.now(), 
    //         Action: "", 
    //         Value: ""
    //     };
    //   //  team.actionLog = team.actionLog.concat(struct);
    // }


}