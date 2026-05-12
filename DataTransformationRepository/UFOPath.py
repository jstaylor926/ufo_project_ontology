from pyspark.sql import Row, SparkSession
from pyspark.sql.functions import col, udf
from pyspark.sql.types import StructType, StructField, StringType, IntegerType
from pyspark.sql.types import DateType, BooleanType, ArrayType, TimestampType
from transforms.api import Input, Output, transform
from datetime import date, timedelta

# Builds a data set for UFOentry Objects
# Comments are made above the line of code they are pertinent to
dossSeenMessages = {}
dossSeenRDAFs = {}
dossSeenInstr = {}


@transform(
    outputData=Output("ri.foundry.main.dataset.c6204753-a537-48d2-8a7a-4f0cd69096dc"),
    messages=Input("ri.foundry.main.dataset.97051eb9-ff7b-4cca-9a9f-4405cc22a94b"),
    appr=Input("ri.foundry.main.dataset.333ee189-ef6d-40ad-9f0a-842e76d86442"),
)
def driver(outputData, appr, messages):
    spark = SparkSession.builder.appName("UFOPath").getOrCreate()
    messagesDF = messages.dataframe()
    messagesDF = messagesDF.filter(messagesDF.PermanentRequest == True)
    messagesDF = messagesDF.select("DossierID", "MessageCreationDate")
    messageRows = messagesDF.collect()

    rdafDF = appr.dataframe()
    rdafDF = rdafDF.filter((rdafDF.DocType == "RDAF") & (rdafDF.Status == "SENT"))
    rdafDF = rdafDF.select("Dossier_ID", "startDate")
    rdafRows = rdafDF.collect()

    instrDF = appr.dataframe()
    instrDF = instrDF.filter(instrDF.DocType != "RDAF")
    instrDF = instrDF.select("Dossier_ID", "startDate")
    instrRows = instrDF.collect()

    entryArr = []
    for each in messageRows:
        permReqTransformation(each)
    for each in rdafRows:
        rdafTransformation(each)
    for each in instrRows:
        instrTransformation(each)

    for each in dossSeenRDAFs.keys():
        vals = finalTrans(each)
        r = Row(*vals)
        entryArr.append(r)
    for each in dossSeenMessages.keys():
        vals = []
        if (each not in dossSeenInstr):
            vals = [each, "RDAF Not Delivered", "Instruction Not Delivered"]
        else:
            permReqDate = dossSeenMessages[each].date()
            instrDate = dossSeenInstr[each]
            del dossSeenInstr[each]
            if (permReqDate > instrDate):
                instrVal = "Instruction Not Delivered"
            else:
                instrVal = "Instruction Delivered"
            vals = [each, "RDAF Not Delivered", instrVal]
        r = Row(*vals)
        entryArr.append(r)

    for each in dossSeenInstr.keys():
        vals = [each, "RDAF Not Delivered", "Instruction Delivered"]
        r = Row(*vals)
        entryArr.append(r)


    # if (len(dossSeenMessages) >= len(dossSeenRDAFs)):
    #     for each in dossSeenMessages.keys():
    #         vals = {each, finalTrans(each)}
    #         entryArr.append(vals)

    # else:
        # for each in dossSeenRDAFs.keys():
        #     vals = [each, finalTrans(each)]
        #     r = Row(*vals)
        #     entryArr.append(r)

    schemaSet = schemaSetGen()
    ret = spark.createDataFrame(entryArr, schemaSet)
    outputData.write_dataframe(ret)


def permReqTransformation(permReq):
    if permReq[0] not in dossSeenMessages:
        dossSeenMessages[permReq[0]] = permReq[1]
    else:
        if (permReq[1] > dossSeenMessages[permReq[0]]):
            dossSeenMessages[permReq[0]] = permReq[1]

def rdafTransformation(rdaf):
    if rdaf[0] not in dossSeenRDAFs:
        dossSeenRDAFs[rdaf[0]] = rdaf[1]
    else:
        if (dossSeenRDAFs[rdaf[0]] is None) :
            dossSeenRDAFs[rdaf[0]] = rdaf[1]
        elif (rdaf[1] is not None) and (rdaf[1] > dossSeenRDAFs[rdaf[0]]):
            dossSeenRDAFs[rdaf[0]] = rdaf[1]

def instrTransformation(instr):
    if instr[0] not in dossSeenInstr:
        dossSeenInstr[instr[0]] = instr[1]
    else:
        if (dossSeenInstr[instr[0]] is None) :
            dossSeenInstr[instr[0]] = instr[1]
        elif (instr[1] is not None) and (instr[1] > dossSeenInstr[instr[0]]):
            dossSeenInstr[instr[0]] = instr[1]


def finalTrans(final):
    rdafVal = ""
    instrVal = ""
    permReq = final in dossSeenMessages
    instr = final in dossSeenInstr
    permReqDate = None
    instrDate = None

    if not permReq:
        rdafVal = "RDAF Delivered"
    else:
        permReqDate = dossSeenMessages[final].date()
        del dossSeenMessages[final]
        if (dossSeenRDAFs[final] is None):
            (dossSeenRDAFs[final]) = date.fromisocalendar(2000, 1, 1)
        if (permReqDate > dossSeenRDAFs[final]):
            rdafVal = "RDAF Not Delivered"
        else:
            rdafVal = "RDAF Delivered"

    if not instr:
        instrVal = "Instruction Not Delivered"
    else:
        if (permReqDate is None):
            del dossSeenInstr[final]
            instrVal = "Instruction Delivered"
        else :
            instrDate = dossSeenInstr[final]
            del dossSeenInstr[final]
            if (permReqDate > instrDate):
                instrVal = "Instruction Not Delivered"
            else:
                instrVal = "Instruction Delivered"
    return [final, rdafVal, instrVal]


def schemaSetGen():
    schema = StructType([
        StructField("DossierID", StringType(), False),
        StructField("RDAF", StringType(), False),
        StructField("Instructions", StringType(), False)
        ])
    return schema
