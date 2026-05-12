import {Integer,  LocalDate, Function,Edits, OntologyEditFunction, isTimestamp, 
        Timestamp, FunctionsMap, Filters, ExternalSystems, Notification, EmailNotificationContent,
        ShortNotification,
        Distance} from "@foundry/functions-api";
import {Objects,  ObjectSet, Ufoentry, UfopathObject, UfoFsr, Ufoescalation, Fsrteam, LogFsrinputDriver} from "@foundry/ontology-api";

export class ReportGenerator {
    
    @Function()
    public reportDriver(team: Fsrteam) : Notification {
        let escalations = this.getEscalations(team);
        let teamName = team.operator;
        console.log(escalations)
        escalations = escalations.filter(f => ((f.escalationRasisedDate !== undefined) && (f.escalationRasisedDate >= LocalDate.now())));
        let retString = '<ul style="list-style-position: inside; padding-left: 0; margin-left: 0;">';
        escalations.forEach(esc => {
           let escString = "<li> <i>" + esc.user?.trim() + "</i> requested a(n) " + esc.escalationType + " escalation on <b> Dossier " + esc.dossierId + "</b> </li>";
           retString = retString.concat(escString);
        });
        retString = retString.concat("</ul>")
        retString = retString.concat(this.getComments(team));
        console.log(retString);
        //let commentString = this.getComments(team);

        const emailNotificationContent = EmailNotificationContent.builder()
            .subject("Escalation Report - " + teamName)
            .body(retString)
            .build();

        const shortNotification = ShortNotification.builder()
            .heading("Escalation Report")
            .content("escalation")
            .build();


        return Notification.builder().shortNotification(shortNotification).emailNotificationContent(emailNotificationContent).build();

    }

    @Function()
    public getEscalations(team: Fsrteam) : Ufoescalation[] {
        let retArr : Ufoescalation[] =[];
        let fsrList = team.ufofsrs.all(); 
        if (fsrList === undefined) {
            return retArr;
        }
        for (let i = 0; i < fsrList.length; i++) {
            retArr = retArr.concat(fsrList[i].ufoescalations.all())
        }
        return retArr;
    }

    @Function()
    public getComments(team: Fsrteam) : string {
        const dict = new Map<string, string[]>;
        let now = Timestamp.now().valueOf();
        const oneDayAgoMillis = now - 24 * 60 * 60 * 1000;
        let comms = team.comments;
        for (let i = 0; i < (comms ?? []).length; i++) {
            let commentAttributes = (comms ?? [])[i].split("%*");
            let time = parseInt(commentAttributes[0].trim());
            let dossId = commentAttributes[1].trim();
            let name = commentAttributes[2].trim();
            let code = commentAttributes[3].trim();
            let comment = name + " " +"(" + code +"): " + commentAttributes[4].trim();
            if (time > oneDayAgoMillis) {
                if(dict.has(dossId)) {
                    dict.get(dossId)?.push(comment);
                }
                else {
                    dict.set(dossId, [comment]);
                }
            }
        }
        console.log(dict);
        return this.formatComments(dict);
    }

    public formatComments(dict: Map<string, string[]>) :string {
        let ret = "<div>";
        ret += "<table style='border-collapse: collapse;'>";
        ret += "<tbody>";
        for (const [k, values] of dict.entries()) {
            ret += "<tr>";
            ret += "<td>";
            ret += `<h2>${k}</h2>`;
            ret += "<ul>";
            for (const v of values) {
                ret += `<li>${v}</li>`;
            }
            ret += "</ul>";
            ret += "</td>";
            ret += "</tr>";
        }
        ret += "</tbody>";
        ret += "</table>";
        ret += "</div>";
        return ret;
    }

    @Function()
    public getActions(team: Fsrteam): string {
        console.log(team.watchList)
        let now = Timestamp.now().valueOf();
        const oneDayAgoMillis = now - 24 * 60 * 60 * 1000;
        let logs = Objects.search().logFsrinputDriver().all().filter(f => 
            ((f.actionTimestamp?.valueOf() ?? 0) > oneDayAgoMillis) && 
            ((team.watchList ?? []).includes((f.ufoentry??[0])[0])));
        
        logs.forEach(e => console.log(e.actionRid));
        return "";
    }

    public translateActions(logs: LogFsrinputDriver[]): string {
        return "";
    }   
 }



