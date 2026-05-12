import { Function, FunctionsMap, OntologyEditFunction} from "@foundry/functions-api";
import { ObjectSet, Ufoentry, UfoFsr} from "@foundry/ontology-api";


export class Misc {
    
    // @Function() 
    // public messagesForSheets (entriesParam : ObjectSet<Ufoentry>) : FunctionsMap<Ufoentry, string[]> {
    //     let entries = entriesParam.all();
    //     let map = new FunctionsMap<Ufoentry, string[]>();
    //     for (let i = 0; i < entries.length; i++) {
    //         let arr = [];
    //         let entry = entries[i];
    //         let messages = entry.messageKpi.all().filter(e => (e.messageStatus === "OPEN"))
    //         for (let it = 0; it < messages.length; it++) {
    //             // let fro = messages[it].messageFrom;
    //             // if (fro === undefined) {fro = "xx";}
    //             // let str = messages[it].messageId.concat("--").concat(fro).concat("///");
    //             arr.push(messages[it].messageId);
    //         }
    //         map.set(entry, arr);
    //     }
    //     return map;
    // }

    // @Function() 
    // public messagesForSheetsFrom (entriesParam : ObjectSet<Ufoentry>) : FunctionsMap<Ufoentry, string[]> {
    //     let entries = entriesParam.all();
    //     let map = new FunctionsMap<Ufoentry, string[]>();
    //     for (let i = 0; i < entries.length; i++) {
    //         let arr = [];
    //         let entry = entries[i];
    //         let messages = entry.messageKpi.all().filter(e => (e.messageStatus === "OPEN"))
    //         for (let it = 0; it < messages.length; it++) {
    //             let fro = messages[it].messageFrom;
    //             if (fro === undefined) {fro = "xx";}
    //             //let str = messages[it].messageId;
    //             arr.push(fro);
    //         }
    //         map.set(entry, arr);
    //     }
    //     return map;
    // }
    
    // @Function() 
    // public fleetForSheetsUAL (entriesParam : ObjectSet<Ufoentry>) : FunctionsMap<Ufoentry, string> {
    //     let dict: {[key:string]:string} = {
    //                         "N830UA": "4030", 
    //                         "N4296UA" : "4296",
    //                         "N891UA" : "4891", 
    //                         "N897UA" : "4897",
    //                         "N14503" : "4503"
    //                         };

    //     let entries = entriesParam.all();
    //     let map = new FunctionsMap<Ufoentry, string>();
    //     for (let i = 0; i < entries.length; i++) {
    //         let entry  = entries [i];
    //         let reg = entry.regNumber;
    //         if (reg === undefined || !(reg in dict)){
    //             map.set(entry, "")
    //         } else {
    //             let val = dict[reg]
    //             map.set(entry, val);
    //         }
            
    //     }
    //     return map;
    // }
    
    // @Function()
    // public closeDossiersMessage(entriesParam: ObjectSet<Ufoentry>) : string {
    //     let entries = entriesParam.all(); 
    //     let userClosedEntries = entries.filter(item => item.status === "CLSD-u");
    //     let message = "Hi," + "\n" + "The following TechRequest Dossiers are currently open,"+ 
    //     " but one or more of the Field Service Representatvies have identified them as Dossiers that should be marked as closed."
    //     +"\n" + "If possible, please review these Dossiers and ensure that their Dossier Status is correct."
    //     +"\n"+ "Thank you," + "\n" + "Luis Bowen"+ "\n" + "luis.bowen@airbus.com" ;
    //     for (let i = 0; i < userClosedEntries.length; i ++ ) {
    //         let holderStr = "\n" + userClosedEntries[i]?.idDossier +" - " +userClosedEntries[i].title?.substring(0,25);
    //         message = message.concat(holderStr);
    //         }
    //     return message;
    // }

    @OntologyEditFunction()
    public commentFlag(fsrParam: ObjectSet<UfoFsr>) : void {
        let entries = fsrParam.all();
        entries.forEach(entry =>
        {
            if (entry.postCommentFlag === undefined) {
                entry.postCommentFlag = false;
            }
            else if(!(entry.postCommentFlag)) {
                entry.postCommentFlag = true;
            }
            else {
                entry.postCommentFlag = false;
            }
        })
    }

 }