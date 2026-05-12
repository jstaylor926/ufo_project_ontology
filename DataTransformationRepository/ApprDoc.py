from pyspark.sql import Row, SparkSession
from pyspark.sql.functions import col, udf
from pyspark.sql.types import StructType, StructField, StringType, IntegerType
from pyspark.sql.types import DateType, BooleanType, ArrayType, TimestampType
from transforms.api import Input, Output, transform
from datetime import date, timedelta

# Builds a data set for UFOentry Objects
# Comments are made above the line of code they are pertinent to
dossSeenMessages = {}
docsSeenRDAFs = []
issueDict = {'A' : 1, 'B' : 2, 'C' : 3, 'D' : 4, 'E' : 5, 'F' : 6, 'G' : 7, 'H' : 8,
            'I' : 9, 'J' : 10, 'K' : 11, 'L' : 12, }
rdafIgnore = ['target_date', 'end_target_date', 'approval_date', 'total_flight_cycles',
              'total_flight_hours', 'component_flight_hours', 'component_flight_cycles']


@transform(
    outputData=Output("ri.foundry.main.dataset.333ee189-ef6d-40ad-9f0a-842e76d86442"),
    rdaf=Input("ri.foundry.main.dataset.beacb919-5b40-4d46-b7c8-fb32b98e3676"),
    message=Input("ri.foundry.main.dataset.127cfa45-930c-4512-b093-43f345f203a4"),
)
# compute function
def compute(message, rdaf, outputData):
    spark = SparkSession.builder.appName("UFOApprovalDocs").getOrCreate()
    schemaSet = schemaSetGen()
    rdaf_DF = rdaf.dataframe()
    message_DF = message.dataframe()
    rdaf_DF = rdaf_DF.select(['approvalDocStatus', 'total_flight_cycles', 'total_flight_hours',
                                'component_flight_hours', 'component_flight_cycles',
                                'target_date', 'end_target_date',
                                'id_dossier', 'approvalDoc_id',
                                'approvalDocType', 'approvalDocCategory',
                                'limitation_type', 'approvalDocIssue',
                                 'approval_date', 'rdaf_type', 'assigned_date'])
    message_DF = message_DF.select(['messageStatus', 'id_dossier', 'id_message', 'messageAttachmentName', 'messageSubmitDate'])
    rdafRows = rdaf_DF.collect()
    messageRows = message_DF.collect()
    entryArr = []
    columnHeadersRDAF = []
    columnHeadersMessage = []
    #seen = []
    for it in range(0, len(rdafRows[0])):
        columnHeadersRDAF.append(rdaf_DF.select(rdaf_DF[it]).dtypes[0][0])
    for each in rdafRows:
        row = transformationRDAF(each, columnHeadersRDAF)
        # adding the generated row to entryArr, initialized earlier
        if (not (row == None)):
            entryArr.append(row)
    for it in range(0, len(messageRows[0])):
        columnHeadersMessage.append(message_DF.select(message_DF[it]).dtypes[0][0])
    for each in messageRows:
        transformationMessage(each, columnHeadersMessage)
    for each in dossSeenMessages.values():
        entryArr.append(each)


    ret = spark.createDataFrame(entryArr, schemaSet)
    outputData.write_dataframe(ret)


def transformationRDAF(entry, columnHeaders):
    vals = []
    lifeCycle = {}
    uniKey = 0
    limVal = 0
    docID = None
    if ((entry[0] == "SENT") or (entry[0] == "SCOE"))  :
        for it in range(0, len(entry)):
            data = entry[it]
            columnHead = columnHeaders[it]
            if (columnHead == 'id_dossier'):
                uniKey = int(data)
            if ((columnHead not in rdafIgnore)):
                vals.append(data)
            else:
                if (data is None) or (data == ""):
                    lifeCycle[columnHead] = -1
                else:
                    if ("date" in columnHead):
                        lifeCycle[columnHead] = data
                    else:
                        try: 
                            holder = int(data)
                            lifeCycle[columnHead] = holder
                        except ValueError:
                            lifeCycle[columnHead] = -1
            if (columnHead == 'limitation_type'):
                limVal = limitation(lifeCycle, data)
            if (columnHead == 'approvalDoc_id'):
                docID = data
    else :
        return None
    if (docID not in docsSeenRDAFs) and (docID is not None) :
        docsSeenRDAFs.append(docID)
        vals.append(uniKey)
        vals.append(limVal)
        r = Row(*vals)
        return r



def transformationMessage(entry, columnHeaders):
    if (entry[2] in dossSeenMessages):
        docType = entry[3].upper()
        rd = False
        td = False
        if (docType[0] == "R") or ("R" in dossSeenMessages[entry[2]][3]):
            rd = True
        if (docType[0:2] == "TD") or ("TD" in dossSeenMessages[entry[2]][3]) :
            td = True
        if (td and rd):
            dossSeenMessages[entry[2]][3] = "RD-TD"
        elif (td and (not rd)):
            dossSeenMessages[entry[2]][3] = "TD"
        elif ((not td) and rd):
            dossSeenMessages[entry[2]][3] = "RD"
        else: 
            dossSeenMessages[entry[2]][3] = ""
    else:
        val = ""
        docType = entry[3].upper()
        if (docType[0] == "R"):
            val = "RD"
        if (docType[0:2] == "TD"):
            val = "TD"
        dossSeenMessages[entry[2]] = [entry[0], entry[1], entry[2], val, None,
                                      None, None, None,entry[4], int(entry[1]), None]




def schemaSetGen():
    schema = StructType([
        StructField("Status", StringType(), True),
        StructField("Dossier_ID", StringType(), False),
        StructField("DocumentID", StringType(), False),
        StructField("DocType", StringType(), False),
        StructField("DocCategory", StringType(), True),
        StructField("LimitationType", StringType(), True),
        StructField("Issue", StringType(), True),
        StructField('rdafType', StringType(), True),
        StructField('startDate', DateType(), True),
        #  ____________________________________
        StructField("UniversalKey", IntegerType(), False),
        StructField("LimitationLife", IntegerType(), True)
        ])
    return schema


def limitation(vals, limType):
    if (limType is None) or (limType == '') or (limType == 'null') or (limType == 'N/A'):
        return 0
    if limType == "See below":
        return -1

    truncate = max(limType.find('(') , limType.find("which"))
    if (truncate != -1):
        limType = limType[0: truncate]
    limType = limType.replace("/", "-")
    limType = limType.replace("or", "-")
    limType = limType.lower()
    limType = limType.replace("months", "month")
    limType = limType.replace("years", "year")
    limType = limType.replace("days", "day")
    limType = limType.replace(" ", "")
    limType = limType.replace("temp", "")
    limType = limType.replace("calendar", "")
    limType = limType.replace("(", "")
    limTypes = limType.split("-")
    ret = -1
    for each in limTypes:
        if (("month" in each) or ("year" in each) or ("day" in each) or ("week" in each)):
            try:
                startDate = vals['target_date']
                if (startDate == -1):
                    inter = -1
                else:
                    inter = dateCalc(startDate, each)
            except ValueError:
                inter = -1
        elif ("fc" in each):
            if (vals['component_flight_cycles'] == -1) or ((vals['total_flight_cycles']) == -1) :
                inter = -1
            else:
                try:
                    low = vals['component_flight_cycles']
                    curr = vals['total_flight_cycles']
                    interval = int(each[0:each.index("f")])
                    inter = nonDateCalc(low, curr, interval)
                except ValueError:
                    inter = -1
        elif ("fh" in each):
            if (vals['component_flight_hours'] == -1) or ((vals['total_flight_hours']) == -1) :
                inter = -1
            else:
                try:
                    low = vals['component_flight_hours']
                    curr = vals['total_flight_hours']
                    interval = int(each[0:each.index("f")])
                    inter = nonDateCalc(low, curr, interval)
                except ValueError:
                    inter = -1
        else:
            inter = -1
        if (inter > ret):
            ret = inter
    return ret

def dateCalc(startDate, val):
    try:
        days = 0
        if ("year" in val):
            days = days + (int(val[0:val.find("year")])) * 365
        if ("month" in val):
            days = days + int((int(val[0:val.find("month")])) * 30.4)
        if ("week" in val):
            days = days + (int(val[0:val.find("week")])) * 7
        if ("day" in val):
            days = days + (int(val[0:val.find("day")]))
        daysPassed = (date.today() - startDate.date()).days
        ret = int((daysPassed / days) * 100)
        return ret
    except ValueError: 
        return -1
    


def nonDateCalc(lowBound, currVal, interval):
    try:
        return int(((currVal - lowBound) / interval) * 100)
    except: 
        return -1