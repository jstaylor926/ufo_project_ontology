import { Function, MandatoryMarkingPropertyBaseType, Static } from "@foundry/functions-api" 

import {Integer,  LocalDate, Edits, OntologyEditFunction, isTimestamp, Timestamp, FunctionsMap, Filters} from "@foundry/functions-api";
import { Objects,  ObjectSet, Ufoentry, UfopathObject, PriorityAlgorithm, UfoICAO, UfoFsr, _inferRepairDossierStatus} from "@foundry/ontology-api";
//import { PathSupp } from "./PathSupp";
import { commentUsers } from './commentUsersDictionary';


export class Comments {

    /*
    Get Nth Index 
        Helper function used when parsing comments 
        Comment attributes (commenter, date, comment body, type) are separate by a certain char. 
        ex (just a rough example, not a perfect representation of comments stored in UFO Properties):
            123456789%Luis Bowen%This is a comment%Parts   

            123456789 is a Long that represents a time stamp, check documentation but its something like milliseconds since 1970

    */
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

    /*
    New Comment Breakdown Helper 
        labeled 'helper' - misnomer, is main Driver 
        Map each entry to 
    */
   @Function()
    public newCommentBreakdownhelper (entriesParam : ObjectSet<Ufoentry>, fsr: UfoFsr) : FunctionsMap<Ufoentry, string|undefined> {
        let logIn = fsr.lastLogIn;
        if (logIn === undefined) {
            logIn = Timestamp.fromISOString((new Date(0)).toISOString());
        }
        let map = new FunctionsMap<Ufoentry, string|undefined>();
        let entries = entriesParam.all(); 
        for (let i = 0; i < entries.length; i++) {
            let types : Record<string, number> = {"Parts": 0, "Technical": 0, "Customer Support": 0, "Linked": 0};

            let comm = entries[i].comments;
            if (comm !== undefined) {
                for (let it = 0; it < comm.length; it++) {
                    let commentCodeStart = this.getNthIndexOf(comm[it], '.', 2);
                    let commentStart = this.getNthIndexOf(comm[it], '.', 3);
                    let nameStart = this.getNthIndexOf(comm[it], '.', 1 );

                    const subCode = comm[it].substring((commentCodeStart+1), commentStart);
                    let dateStr = comm[it].substring(0, nameStart);
                    var date;
                    if (dateStr.includes("-")){
                        date = Timestamp.fromISOString(dateStr);
                    } else {
                        date = new Date(Number(dateStr));
                        dateStr = date.toLocaleString();
                    }   
                    if (date >= logIn) {
                        types[subCode] += 1;
                    }
                }
                
            }

            let linkedComms = entries[i].linkedComments;
            if (linkedComms !== undefined) {
                types["Linked"] = this.linkedCommentcounterHelper(entries[i], linkedComms, logIn, false);
            }

            let str = (" Parts: " + types["Parts"] + " \n Tech: " + types["Technical"] + " \n CS: " + types["Customer Support"]+ " \n Link: " + types["Linked"]) 
            if (types["Parts"] === 0 && types["Technical"] === 0 && types["Customer Support"] === 0 && types["Linked"] === 0){map.set(entries[i],""); }
            else{map.set(entries[i], str);}
        }
        return map;
    }

    /*
    Linked Comment Counter and Helper  
        FSR view has a function backed column that denotes how many linked comments exist for a dossier 
            ex: 
            UFO 123 is tied to msn 10
            UFO 124 is tied to msn 10 
            UFO 125 is tied to msn 10 
            UFO 124 makes a comment that IS linked to msn dossiers "Comment A"
            UFO 124 makes a comment that IS NOT linked to msn dossiers "Comment B"
            UFO 125 makes a comment that IS linked to msn dossiers "Comment C"
            UFO 123 has 2 linked comments, "Comment A" and "Comment B"
    */
    @Function()
    public linkedCommentcounter(entriesParam: ObjectSet<Ufoentry>,fsr:UfoFsr) : FunctionsMap<Ufoentry, Integer|undefined> {
        let logIn = fsr.lastLogIn;
        if (logIn === undefined) {
            logIn = Timestamp.fromISOString((new Date(0)).toISOString());
        }
        let map = new FunctionsMap<Ufoentry, number|undefined>();
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){
            let linkedComms = entries[i].linkedComments;
            let count = 0;
            if (linkedComms !== undefined) {
                count = this.linkedCommentcounterHelper(entries[i], linkedComms, logIn, true);
                
            } 
            map.set(entries[i], count)
        }
        return map;
    }

    public linkedCommentcounterHelper(entry: Ufoentry , linkedComms: readonly string[], logIn: Timestamp, total: boolean) :number {
        let count = 0;
         for (let it = 0; it < linkedComms.length; it++) {
                    let comment = linkedComms[it];
                    let timeStampStart = this.getNthIndexOf(comment, '.', 1);
                    let commentStart = this.getNthIndexOf(comment, '.', 2);
                    if (((timeStampStart < 10) && (timeStampStart !== -1)) && (commentStart !== -1)) {
                        let dossId = comment.substring(0, timeStampStart);
                        if (dossId !== entry.idDossier){
                            let dateStr = comment.substring(timeStampStart + 1, commentStart);                            
                            if (((Number(dateStr)) >= Number(logIn)) || total) {
                                count += 1;
                            }
                        }
                    }
                }
        return count;
    }

    


    /*
    Comment String Formatter
        Helper function that formats strings for the SBC view of the comments (left click on UFOEntry and view only parts comment for example).

    */
    public static commentStringFormatter(commentParam :string) : string {
        let comment = JSON.stringify(commentParam);
        let ret = " \n";
        let linesNoBlanks = comment.replace(/(?:\\r\\n|\\r|\\n)+/g, '\\n').split('\\n');   
        for (let i = 0; i < linesNoBlanks.length; i++) {
            if (linesNoBlanks[i][0] === '"'){linesNoBlanks[i] = linesNoBlanks[i].substring(1);}
            if (linesNoBlanks[i][linesNoBlanks[i].length - 1] === '"'){linesNoBlanks[i] = linesNoBlanks[i].substring(0, linesNoBlanks[i].length -1);}
            linesNoBlanks[i] = linesNoBlanks[i].trim();
            linesNoBlanks[i] = (" ##### *").concat(linesNoBlanks[i]).concat("*\n");
            ret = ret.concat(linesNoBlanks[i]);
        }
        return ret;
    }

    /*
    Add Comments to UFOEntry
        Comments already exist in the Comments Widget, which are tied to a specific Ontology Object.
        In other words, the Comments widget stores comments with an Object.  WHen we click on Object A, the comments widget shows the comments made on Comment A 
        This function adds the comment to the property that exist on the UFO Object type, "Comments", a string array 
        Since the entire comment is just stored as a string, this functions adds characters making it easier to parse, '%' and '.' 
    */
    @Edits(Ufoentry)
    @OntologyEditFunction()
    public async addCommentstoUFOEntry(entry:Ufoentry, comment :string,  link: boolean, ids: string[], commentCode: string, name:string ): Promise<void>{
        let fsrTeam = Objects.search().fsrteam().all().filter(f => f.operator === entry.operIcao)[0]
        let fsr = Objects.search().ufoFsr().all().filter(f => f.name === name)[0]
        let now = Timestamp.now().valueOf().toString();
        for (const key of Object.keys(commentUsers)) {
                        if (comment.includes(key)) {
                            comment = comment.replaceAll(key, commentUsers[key]);
                        }
        }
        let linkComment = comment;
        let teamComment = now.concat("%*").concat(entry.idDossier?? "-").concat("%*").concat(name).concat("%*").concat(commentCode).concat("%*").concat(comment);
        comment = now.concat(".").concat(name).concat(".").concat(commentCode).concat(".").concat(comment);
        console.log(comment)
        let entries = new Array() as Ufoentry[];
        for (let i = 0; i < ids.length; i++){
            let inter = Objects.search().ufoentry().filter(ufoEnt => ufoEnt.idDossier.exactMatch(ids[i])).all();
            entries = entries.concat(inter);
        }
    
        let linksPresent = (entries.length > 0);
        try {
            let arr = new Array();
            let teamArr = new Array();
            if(entry.comments !== undefined) {
                for (let i = 0; i < entry.comments.length; i++) {
                    if (entry.comments[i] !== undefined && entry.comments[i] !== "" ) {
                        arr.push(entry.comments[i]);
                    }
                }
            }
            if((fsrTeam !== undefined) && (fsrTeam.comments !== undefined)){
                for (let it = 0; it < fsrTeam.comments.length; it++) {
                    if (fsrTeam.comments[it] !== undefined && fsrTeam.comments[it] !== "" ) {
                        teamArr.push(fsrTeam.comments[it]);
                    }
                }
            }
            
            arr.push(comment);
            teamArr.push(teamComment);
            entry.comments = arr;
            
            if ((fsrTeam !== undefined)) {
                fsrTeam.comments = teamArr;
            }
                       
            let rn = Timestamp.now();
            if(commentCode === 'Parts') {entry.lastPartsComment = rn;} 
            if (commentCode === 'Technical') {entry.lastTechComment = rn;}
            if (commentCode === 'Customer Support') {entry.lastCustComment = rn;}
            
            
        } catch (error) {
            console.log("");
        }
        if ((link) && (linksPresent)) {
            let stringConcat = entry.idDossier?.concat(".").concat(now).concat(".").concat(linkComment);
            if (stringConcat !== undefined) {
                this.updateLinkedComments(entries, stringConcat);

            }
        }
        fsr.postCommentFlag = true;
    }

    /*
    Update Linked Comments 
        helper function called to add a comment to the linkedComments property of linked UFOEntries 
        ex: 
            UFO 123 is tied to msn 10
            UFO 125 is also tied to msn 10  
            a comment is made on UFO 123 "Comment A" that is linked to all dossiers that share that msn 
            this function adds "Comment A" to the linkedComments Property of UFO 125
    */

    @OntologyEditFunction()
    public updateLinkedComments(entriesParam: Ufoentry[], comment: string) :  void {
        for (let i = 0; i < entriesParam.length; i ++) {
            let entry = entriesParam[i];
            let arr = new Array();
            if(entry.linkedComments !== undefined) {
                for (let i = 0; i < entry.linkedComments.length; i++) {
                    if (entry.linkedComments[i] !== undefined && entry.linkedComments[i] !== "" ) {
                        arr.push(entry.linkedComments[i]);
                    }
                }
            }
            arr.push(comment);
            entry.linkedComments = arr;
        } 
    }



    @Function ()
    public linkedCommentViewDriver(entriesParam : ObjectSet<Ufoentry>, mainEntry: Ufoentry): FunctionsMap<Ufoentry, string>{
        let entries = entriesParam.all();
        const map = new FunctionsMap<Ufoentry, string>()
        for (let i = 0; i < entries.length; i++) { 
            let linkedEntry = entries[i];
            let com = this.returnLinkedCommentHelper(linkedEntry, mainEntry);
            map.set(linkedEntry, com);
        }
        return map;
    } 
    @Function()
    public returnLinkedCommentHelper(linkedEntry : Ufoentry, mainEntry : Ufoentry): string{
        let ret = "";
        let linkedDossID = linkedEntry.idDossier;
        let mainLinkedComments = mainEntry.linkedComments;
        if (mainLinkedComments === undefined) {
            return ret;
        }
        for (let i = 0; i < mainLinkedComments.length; i++) {
            if (linkedDossID !== undefined){          
                if (mainLinkedComments[i].includes(linkedDossID)) {
                    ret = ret.concat(mainLinkedComments[i]).concat("---\n");
                    ret = ret.replace(linkedDossID, "");
                    ret = ret.replace(" -  ", "");
                    console.log()
                }
            }
        }
        return ret;
    }


    
    /*
    Linked Comments and Most Recent Linked Comment
        Via FSR view -> left click on the UFOEntry-> view linked comments 
        This function returns the string of 'linked comments' 
    */
    @Function ()
    public linkedComments(entriesParam : ObjectSet<Ufoentry>, fsr: UfoFsr) : string {
        let str = "";
        let logIn = fsr.lastLogIn;
        if (logIn === undefined) {
            logIn = Timestamp.fromISOString((new Date(0)).toISOString());
        }
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){ 
            let entry = entries[i];
            if ((entry !== undefined) && (entry.linkedComments !== undefined)) {
                let itlength = entry.linkedComments.length;
                for (let it = 0; it < itlength; it ++) {
                    let comm = entry.linkedComments[it]
                    for (const key of Object.keys(commentUsers)) {
                        if (comm.includes(key)) {
                            comm = comm.replaceAll(key, commentUsers[key]);
                            comm = comm.replaceAll("`", "");
                        }
                    }
                    let timeStampStart = this.getNthIndexOf(comm, '.', 1);
                    let commentStart = this.getNthIndexOf(comm, '.', 2);
                    if (((timeStampStart < 10) && (timeStampStart !== -1)) && (commentStart !== -1)) {
                        let dossId = comm.substring(0, timeStampStart);
                        if (dossId !== entry.idDossier){
                            let dateStr = comm.substring(timeStampStart + 1, commentStart);
                            let comment = comm.substring(commentStart + 1).trim();
                            let commentReturn = Comments.commentStringFormatter(comment);
                            var date = new Date(Number(dateStr));
                            
                            let flag = "";
                            if ((Number(dateStr)) >= Number(logIn)) {
                                flag = "==";
                            }
                            dateStr = date.toLocaleString();
                            str = str.concat("#### " + flag + dateStr + "-" + dossId  + flag + commentReturn + "  \n  \n");
                        }
                    } 
                }
            }
        }
        return str;
    }
    /*
    Most Recent Linked Comment 
        Returns the most recently made linked commment for a UFOEntry
        ex: 
            UFOEntry 123 is tied to A/C msn 10 
            UFOEntries 124, 125, 126 are also tied to A/C msn 10
            124 links a comment on January 1st - "Comment 124"
            125 links a comment on January 6th - "Comment 125"
            126 links a comment on January 3rd - "Comment 126"
            this function maps UFOEntry 123 to "Comment 125" 
    */
   @Function()
    public mostRecentLinkedComment (entriesParam : ObjectSet<Ufoentry>) : FunctionsMap<Ufoentry, string|undefined> {
        let map = new FunctionsMap<Ufoentry, string|undefined>();
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){
            let link = new Array as string[];
            let entry = entries[i];
            map.set(entry, "");
            let itlength = 0;
            if ((entry !== undefined) && (entry.linkedComments !== undefined)) {
                itlength = entry.linkedComments.length;
                for (let it = 0; it < itlength; it++) {
                    let comm = entry.linkedComments[it];
                    for (const key of Object.keys(commentUsers)) {
                        if (comm.includes(key)) {
                            comm = comm.replaceAll(key, commentUsers[key]);
                            comm = comm.replaceAll("`", "");
                        }
                    }    
                    let timeStampStart = this.getNthIndexOf(comm, '.', 1);
                    let commentStart = this.getNthIndexOf(comm, '.', 2);  
                    if (((timeStampStart < 10) && (timeStampStart !== -1)) && (commentStart !== -1)) {
                        let comment = comm.substring(commentStart + 1).trim();
                        let dossId = comm.substring(0, timeStampStart);
                        if (dossId !== entry.idDossier) {
                            link.push(comment);
                    }
                    }
                }
                map.set(entry, link.pop());
            }
        }
        return map;

    }

    
    /*
    Customer Support Comments + Most Recent Customer Suppport Comment
    Parts Comments + Most Recent Parts Comment 
    Technical Comments + Most Recent Technical Comment 
        
        Two families of functions 
        @param entriesParam is the list of UFOEntries upon which the the functions act

        1) custSuppComments(), partsComments(), and technicalComments()
            entriesParam is a Set, but in practice, it is only ever called as a singular UFOEntry
                custSuppComments maps the comments of type 'Customer Support' 
                partsComments maps the comments of type 'Parts' 
                partsComments maps the comments of type 'Technical'

        2) mostRecentCustSuppComments(), mostRecentPartsComments(), and mostRecentTechnicalComments()
            each entry in entriesParam is mapped to one comment. In this case, entriesParam is actually an Set with many Objects
            The comment is the most recent comment of a certain type. The type being mapped is in the name of the function. 
            Each of these functions is used in the Function Backed Columns in 'Leadership View' 
    */
    @Function()
    public custSuppComments (entriesParam : ObjectSet<Ufoentry>, fsr: UfoFsr) : string {
        let str = "";
        let logIn = fsr.lastLogIn;
        if (logIn === undefined) {
            logIn = Timestamp.fromISOString((new Date(0)).toISOString());
        }
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){
            let parts = new Array as string[];
            let entry = entries[i];
            let itlength = 0;
            if ((entry !== undefined) && (entry.comments !== undefined)) {
                itlength = entry.comments.length;
                for (let it = 0; it < itlength; it++) {
                    let comm = entry.comments[it];
                    for (const key of Object.keys(commentUsers)) {
                        if (comm.includes(key)) {
                            comm = comm.replaceAll(key, commentUsers[key]);
                        }
                    }                   
                    let nameStart = this.getNthIndexOf(comm, '.', 1 );
                    let commentCodeStart = this.getNthIndexOf(comm, '.', 2);
                    let commentStart = this.getNthIndexOf(comm, '.', 3);                    
                    if ((nameStart !== -1) && (commentCodeStart !== -1) && (commentStart !== -1)) {

                        let nameStr = comm.substring(nameStart + 1, commentCodeStart).trim();
                        let dateStr = comm.substring(0, nameStart);
                        let subCode = comm.substring((commentCodeStart+1), commentStart);
                        let comment = comm.substring(commentStart+1).trim();

                        let commentReturn = Comments.commentStringFormatter(comment);
                        
                        if (subCode === 'Customer Support') {
                            var date;
                            if (dateStr.includes("-")){
                                date = Timestamp.fromISOString(dateStr);
                            } else {
                                date = new Date(Number(dateStr));
                                dateStr = date.toLocaleString();
                            }   
                            let flag = "";
                                if (date >= logIn) {
                                    flag = "==";
                                    }
                            str = str.concat("#### " + flag + dateStr + "-" + nameStr  + flag + commentReturn + "  \n  \n");
                        }
                    }
                }    
            }
        }
        return str;
    }
   @Function()
    public mostRecentCustSuppComments (entriesParam : ObjectSet<Ufoentry>) : FunctionsMap<Ufoentry, string|undefined> {
        let map = new FunctionsMap<Ufoentry, string|undefined>();
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){
            let custSup = new Array as string[];
            let entry = entries[i];
            map.set(entry, "");
            let itlength = 0;
            if ((entry !== undefined) && (entry.comments !== undefined)) {
                itlength = entry.comments.length;
                for (let it = 0; it < itlength; it++) {
                    let comm = entry.comments[it];
                    for (const key of Object.keys(commentUsers)) {
                        if (comm.includes(key)) {
                            comm = comm.replaceAll(key, commentUsers[key]);
                            comm = comm.replaceAll("`", "");
                        }
                    }      
                    let nameStart = this.getNthIndexOf(comm, '.', 1 );
                    let commentCodeStart = this.getNthIndexOf(comm, '.', 2);
                    let commentStart = this.getNthIndexOf(comm, '.', 3);
                    if ((nameStart !== -1) && (commentCodeStart !== -1) && (commentStart !== -1)) {
                        let subCode = comm.substring((commentCodeStart+1), commentStart);
                        let comment = comm.substring(commentStart+1);
                        if (subCode === 'Customer Support') {
                            custSup.push(comment)
                        }
                    }
                }
                map.set(entry, custSup.pop());
            }
        }
        return map;
    }

    @Function()
    public partsComments (entriesParam : ObjectSet<Ufoentry>, fsr: UfoFsr) : string {
        let str = "";
        let logIn = fsr.lastLogIn;
        if (logIn === undefined) {
            logIn = Timestamp.fromISOString((new Date(0)).toISOString());
        }
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){
            let parts = new Array as string[];
            let entry = entries[i];
            let itlength = 0;
            if ((entry !== undefined) && (entry.comments !== undefined)) {
                itlength = entry.comments.length;
                for (let it = 0; it < itlength; it++) {
                    let comm = entry.comments[it];
                    for (const key of Object.keys(commentUsers)) {
                        if (comm.includes(key)) {
                            comm = comm.replaceAll(key, commentUsers[key]);
                        }
                    }
                    let nameStart = this.getNthIndexOf(comm, '.', 1 );
                    let commentCodeStart = this.getNthIndexOf(comm, '.', 2);
                    let commentStart = this.getNthIndexOf(comm, '.', 3);
                    
                    if ((nameStart !== -1) && (commentCodeStart !== -1) && (commentStart !== -1)) {
                        let nameStr = comm.substring(nameStart + 1, commentCodeStart).trim();
                        let dateStr = comm.substring(0, nameStart);
                        let subCode = comm.substring((commentCodeStart+1), commentStart);
                        let comment = comm.substring(commentStart+1).trim();
                        let commentReturn = Comments.commentStringFormatter(comment);                  
                        if (subCode === 'Parts') {
                            var date;
                            if (dateStr.includes("-")){
                                date = Timestamp.fromISOString(dateStr);
                            } else {
                                date = new Date(Number(dateStr));
                                dateStr = date.toLocaleString();
                            }   
                            let flag = "";
                            if (date >= logIn) {
                                flag = "==";}
                            str = str.concat("#### " + flag + dateStr + "-" + nameStr  + flag + commentReturn + "  \n  \n");
                        }
                    }

                }              
            }
        }
        return str;
    }
    @Function()
    public mostRecentPartsComment (entriesParam : ObjectSet<Ufoentry>) : FunctionsMap<Ufoentry, string|undefined> {
        let map = new FunctionsMap<Ufoentry, string|undefined>();
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){

            let tech = new Array as string[];
            let entry = entries[i];
            map.set(entry, "");
            let itlength = 0;
            if ((entry !== undefined) && (entry.comments !== undefined)) {
                itlength = entry.comments.length;
                for (let it = 0; it < itlength; it++) {
                    let comm = entry.comments[it];
                    for (const key of Object.keys(commentUsers)) {
                        if (comm.includes(key)) {
                            comm = comm.replaceAll(key, commentUsers[key]);
                            comm = comm.replaceAll("`", "");
                        }
                    }      
                    let nameStart = this.getNthIndexOf(comm, '.', 1 );
                    let commentCodeStart = this.getNthIndexOf(comm, '.', 2);
                    let commentStart = this.getNthIndexOf(comm, '.', 3);             
                           
                    if ((nameStart !== -1) && (commentCodeStart !== -1) && (commentStart !== -1)) { 
                        let subCode = comm.substring((commentCodeStart+1), commentStart);
                        let comment = comm.substring(commentStart+1);
                        console.log(comment)
                        if (subCode === 'Parts') {
                            tech.push(comment)
                        }
                    }
                }
                map.set(entry, tech.pop());
            }
        }
        return map;

    }

    @Function()
    public technicalComments (entriesParam : ObjectSet<Ufoentry>, fsr: UfoFsr) : string {
        let str = "";
        let logIn = fsr.lastLogIn;
        if (logIn === undefined) {
            logIn = Timestamp.fromISOString((new Date(0)).toISOString());
        }
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){
            let parts = new Array as string[];
            let entry = entries[i];
            let itlength = 0;
            if ((entry !== undefined) && (entry.comments !== undefined)) {
                itlength = entry.comments.length;
                for (let it = 0; it < itlength; it++) {
                    let comm = entry.comments[it];
                    for (const key of Object.keys(commentUsers)) {
                        if (comm.includes(key)) {
                            comm = comm.replaceAll(key, commentUsers[key]);
                        }
                    }                    
                    let nameStart = this.getNthIndexOf(comm, '.', 1 );
                    let commentCodeStart = this.getNthIndexOf(comm, '.', 2);
                    let commentStart = this.getNthIndexOf(comm, '.', 3);                    
                    if ((nameStart !== -1) && (commentCodeStart !== -1) && (commentStart !== -1)) {
                        let nameStr = comm.substring(nameStart + 1, commentCodeStart).trim();
                        let dateStr = comm.substring(0, nameStart);
                        let subCode = comm.substring((commentCodeStart+1), commentStart);
                        let comment = comm.substring(commentStart+1).trim();
                        
                        let commentReturn = Comments.commentStringFormatter(comment);

                        if (subCode === 'Technical') {
                            var date;
                            if (dateStr.includes("-")){
                                date = Timestamp.fromISOString(dateStr);
                            } else {
                                date = new Date(Number(dateStr));
                                dateStr = date.toLocaleString();
                            }   
                            let flag = "";
                            if (date >= logIn) {
                                flag = "==";
                            }
                            str = str.concat("#### " + flag + dateStr + "-" + nameStr  + flag + commentReturn + "  \n  \n");
                        }
                    }

                }
            }
        }
        return str;
    }
    @Function()
    public mostRecentTechnicalComment (entriesParam : ObjectSet<Ufoentry>) : FunctionsMap<Ufoentry, string|undefined> {
        let map = new FunctionsMap<Ufoentry, string|undefined>();
        let entries = entriesParam.all();
        for(let i = 0; i < entries.length; i++){
            let tech = new Array as string[];
            let entry = entries[i];
            map.set(entry, "");
            let itlength = 0;
            if ((entry !== undefined) && (entry.comments !== undefined)) {
                itlength = entry.comments.length;
                for (let it = 0; it < itlength; it++) {
                    let comm = entry.comments[it];
                    for (const key of Object.keys(commentUsers)) {
                        if (comm.includes(key)) {
                            comm = comm.replaceAll(key, commentUsers[key]);
                            comm = comm.replaceAll("`", "");
                        }
                    }      
                    let nameStart = this.getNthIndexOf(comm, '.', 1 );
                    let commentCodeStart = this.getNthIndexOf(comm, '.', 2);
                    let commentStart = this.getNthIndexOf(comm, '.', 3);                  
                    if ((nameStart !== -1) && (commentCodeStart !== -1) && (commentStart !== -1)) {
                        let subCode = comm.substring((commentCodeStart+1), commentStart);
                        let comment = comm.substring(commentStart+1);
                        console.log(comment);
                        if (subCode === 'Technical') {
                            tech.push(comment)
                        }
                    }
                }
                map.set(entry, tech.pop());
            }
        }
        return map;
    }
}