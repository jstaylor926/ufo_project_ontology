import {Integer, LocalDate, Function,Edits, OntologyEditFunction, isTimestamp, Timestamp, FunctionsMap, Filters} from "@foundry/functions-api";
import { Objects,  ObjectSet, Ufoentry, UfopathObject, PriorityAlgorithm, UfoICAO, UfoFsr} from "@foundry/ontology-api";


export class Restoration {
    

    @Function()
    public returnRestoredList(list: string[]) :string[] {
        return (list ?? []);
    }

    @Function()
    public returnRestoredList_number(list: string[]) :Integer[] {
        let arr: Integer[] =[];
        for (let i = 0; i < list.length; i ++) {
            arr.push(parseInt(list[i]))
        }
        return arr;
    }

    



    @Function()
    public filterChange(icaoA: string[], icaoB: string[], trStatusA: string[], trStatusB: string[], domA: string[], domB: string[],
                        urgA: string[], urgB: string[], acA: string[], acB: string[], engA: string[], engB: string[], 
                        hiddenA:string[], hiddenB:string[], msnA: string[], msnB: string[], dossStatA: string[], dossStatB: string[]) :boolean {

        const icaoOrig = [...(icaoA ?? [])].sort();
        const icaoRest = [...(icaoB ?? [])].sort();
        let icao = (icaoOrig.length === icaoRest.length) &&  icaoOrig.every((value, index) => value === icaoRest[index]);

        const trStatusOrig = [...(trStatusA ?? [])].sort();
        const trStatusRest = [...(trStatusB ?? [])].sort();
        let trStatus = (trStatusOrig.length === trStatusRest.length) && (trStatusOrig.every((value, index) => value === trStatusRest[index]));


        const domOrig = [...(domA ?? [])].sort();
        const domRest = [...(domB ?? [])].sort();
        let dom = (domOrig.length === domRest.length) &&  domOrig.every((value, index) => value === domRest[index]);

        const urgOrig = [...(urgA ?? [])].sort();
        const urgRest = [...(urgB ?? [])].sort();
        let urg = (urgOrig.length === urgRest.length) &&  urgOrig.every((value, index) => value === urgRest[index]);

        const acOrig = [...(acA ?? [])].sort();
        const acRest = [...(acB ?? [])].sort();
        let ac = (acOrig.length === acRest.length) &&  acOrig.every((value, index) => value === acRest[index]);

        const engOrig = [...(engA ?? [])].sort();
        const engRest = [...(engB ?? [])].sort();
        let eng = (engOrig.length === engRest.length) && engOrig.every((value, index) => value === engRest[index]);

        const hiddenOrig = [...(hiddenA ?? [])].sort();
        const hiddenRest = [...(hiddenB ?? [])].sort();
        let hidden = (hiddenOrig.length === hiddenRest.length) && hiddenOrig.every((value, index) => value === hiddenRest[index]);

        
       
        // const ataOrig = [...(this.retStringArr(ataA))].sort();
        // const ataRest = [...(this.retStringArr(ataB))].sort();
        // let ata = (ataOrig.length === ataRest.length) &&  ataOrig.every((value, index) => value === ataRest[index]);

        const msnOrig = [...(msnA ?? [])].sort();
        const msnRest = [...(msnB ?? [])].sort();
        let msn = (msnOrig.length === msnRest.length) &&  msnOrig.every((value, index) => value === msnRest[index]);

        const dossStatOrig = [...(dossStatA ?? [])].sort();
        const dossStatRest = [...(dossStatB ?? [])].sort();
        let dossStat = (dossStatOrig.length === dossStatRest.length) && dossStatOrig.every((value, index) => value === dossStatRest[index]);

        let ret = !(icao && trStatus && dom && urg && ac && eng && hidden && msn && dossStat)
        return ret;
    }

    public retStringArr(arr: string[]|Integer[]) : string[] {
        let retArr : string[] =[];
        for (let i = 0; i < arr.length; i++) {
            let val = arr[i]
            retArr.push((val).toString())
            
        }
        return retArr;
    }
    


 }