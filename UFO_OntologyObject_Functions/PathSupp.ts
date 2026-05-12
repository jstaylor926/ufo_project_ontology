// import { Function, Integer } from "@foundry/functions-api" ;
// import {UfopathObject, MessageKpi, UfoApprovalDocument} from "@foundry/ontology-api";
// import {OntologyEditFunction}  from "@foundry/functions-api";


// const states = {

//     DO_AWAITING_INFORMATION : {
        
//     },
//     DO_AWAITING_WORK_COMPLETION : {

//     },
//     CUSTOMER_AWAITING_RDAF : {

//     },
//     TEMP_RDAF_DELIVERED : {

//     },
//     PERM_RDAF_DELIVERED : {

//     }
// };

// let condition1 = false; 
// let condition2 = false; 
// let condition3 = false; 
// let conditions = [condition1, condition2, condition3];


// export class PathSupp {

// public stateMachineDriver(entry: UfopathObject) : void{
//     let boolKey = this.getBooleanVals(entry);
    
// }

// public getBooleanVals(entry : UfopathObject) : Integer{
//     let docs = this.pullApprovalDocs(entry);
//     let messages = this.pullRelevantMessages(entry);

//     return 0; 
// }

// public findKeyVal(conditions : boolean[]) : number{
//     let key = 0; 
//     for (let i = 0; i < conditions.length; i++) {if (conditions[i]) {key  += Math.pow(2, i);}} 
//     return key;
// }

// public pullRelevantMessages(entry: UfopathObject) : MessageKpi[] {
//     let messNb = Number(entry.message?.substring(entry.message.indexOf("/")+1));
//     let retMessages = new Array;
//     let messages = entry.messageKpi.all();
//     for (let i = 0; i < messages.length; i ++) {
//         let str = messages.at(i)?.messageId
//         if (str !== undefined) {
//             let messNb2 = Number(str.substring(str.indexOf("/") + 1));
//             if(messNb2 > messNb) {retMessages.push(messages.at(i));}
//         }
//     }
//     return retMessages;
// } 

// public pullApprovalDocs(entry: UfopathObject) : UfoApprovalDocument[] {
//     let docNb = Number(entry.message?.substring(entry.message.indexOf("/")+1));
//     let retDocs = new Array;
//     let docs = entry.ufoApprovalDocument.all();
//     for (let i = 0; i < docs.length; i ++) {
//         let str = docs.at(i)?.documentId
//         if (str !== undefined) {
//             let docNb2 = Number(str.substring(str.indexOf("/") + 1));
//             if(docNb2 > docNb) {retDocs.push(docs.at(i));}
//         }
//     }
//     return retDocs;
// } 

// public condition1(message: MessageKpi) : [boolean, string] {
//    //return (message.damageReport && message.ack);
//    return [false, "null"];
// }

// }



// export class Node{

// }


