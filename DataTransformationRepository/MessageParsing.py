from pyspark.sql import Row, SparkSession
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, BooleanType, DateType, TimestampType
from transforms.api import Input, Output, transform
import datetime
# Builds a data set for ICAO Objects
# this build mostly just creates a template for the ICAO objects as most of the deditting will be done through the
#       Onotology and Ontology actions, which allows for a more dynamic usage of ICAO objects
# Comments are made above the line of code they are pertinent to


@transform(
    source_df=Input("ri.foundry.main.dataset.8fa6145d-7123-4c67-a630-9d879b1a1aa9"),
    outputData=Output("ri.foundry.main.dataset.97051eb9-ff7b-4cca-9a9f-4405cc22a94b"),
)
def driver(outputData, source_df):
    spark = SparkSession.builder.appName("UFOMessages").getOrCreate()
    # building the column Schema for the output data set
    schemaSet = schemaSetGen()
    # pull datframe from INPUT data set
    source_df = source_df.dataframe()
    # selects relevant columns from INPUT dataset
    source_df = source_df.select(['id_dossier', 'id_message', 'messageCreationDate',
                                  'messageFrom_companyName', 'messageTo_companyName',
                                  'messageFrom_partnerType', 'messageStatus', 'operatorICAOCode',
                                  'CustomerMessageToSBC', 'CustomerMessageToSBC', 'ToSBCAW',
                                  'FromSBCAW', 'messageTitle',
                                  'messageSubmitDate', 'is_messageAcknowledge'])
    Rows = source_df.collect()  # noqa
    entryArr = []
    # columnHeaders will hold the columnHeaders, essentially the schemaSet, from the INPUT data set
    columnHeaders = []
    seen = []
    # looping thru every column to populate columnHeaders
    #       source_df[it] : Column<'columnName'>   <-- Column Object
    #       source_df.select(source_df[it]) : DataFrame['columnName': columnDataType]    <-- DataFrame object
    #       source_df.select(source_df[it]).dtypes : [('columnName', 'columnDataType')]  <-- Array holding a tuple
    #       source_df.select(source_df[it]).dtypes[0] : ('columnName', 'columnDataType')  <-- tuple
    #       source_df.select(source_df[it]).dtypes[0][0] : columnName  <-- String
    for it in range(0, len(Rows[0])):
        columnHeaders.append(source_df.select(source_df[it]).dtypes[0][0])

    # looping thru every row that was collected from the INPUT data set
    # largest for loop in the script
    for each in Rows:
        # generating a new row based off row from INPUT data set
        if each[1] not in seen:
            seen.append(each[1])
            row = Transformation1(each, columnHeaders)
        # adding the generated row to entryArr, initialized earlier
            if (not (row == None)):
                entryArr.append(row)

    # creates dataframe with array of rows and defined schemaSet
    # SchemaSet defines the columnHeaders and dataTypes
    ret = spark.createDataFrame(entryArr, schemaSet)
    # populates the output dataset with the created dataframe
    outputData.write_dataframe(ret)


def Transformation1(entry, columnHeaders):
    vals1 = []
    hours = 0
    messOpen = False
    permanentReq = False
    externalReq = False
    DR = False
    for it in range(0, len(entry)):
        data = entry[it]
        columnHead = columnHeaders[it]
        vals1.append(data)
        if (columnHead == 'messageStatus'):
            messOpen = (data == "OPEN")
        elif (columnHead == 'messageCreationDate'):
            hours = (datetime.datetime.now().timestamp() - entry[it].timestamp()) / (60 * 60)
        elif (columnHead == 'messageFrom_partnerType'):
            externalReq = (data == "External Requestor")
        elif (columnHead == 'messageTitle'):
            permanentReq = permReq(data, externalReq)
            DR = damageReport(data)

            # data = data.lower()
            # perm = "permanent" in data
            # req = "request" in data
            # rdaf = "rdaf" in data
            # rf = "rf" in data
            # disregard = "disregard" in data
            # request = rf or req
            # clarification = "clarification" in data
            # repairInstr = "repair" in data and "instruction" in data
            # notDisqualified = (not (disregard or clarification)) and (externalReq)
            # permanentReq = ((request and rdaf) or (request and perm) or (perm and rdaf) or (request and repairInstr)) and notDisqualified
    vals1.append(int(entry[0]))
    vals1.append(int(hours))
    vals1.append(datetime.datetime.now())
    vals1.append(permanentReq)
    vals1.append(DR)
    r = Row(*vals1)  # makes a Row object with the values in vals
    #                   splat operator * iterates over every object in vals1
    if ((messOpen) or (hours < 500)):
        return (r)
        return vals1
    else:
        return None


def schemaSetGen():
    schema = StructType([
        StructField("DossierID", StringType(), False),
        StructField("MessageID", StringType(), False),
        StructField("MessageCreationDate", TimestampType(), False),
        StructField("MessageFrom", StringType(), False),
        StructField("messageTo", StringType(), False),
        StructField("messageFrom_partnerType", StringType(), False),
        StructField("messageStatus", StringType(), False),
        StructField("OperatorICAO", StringType(), True),
        StructField("CustomerMessageToSBC", BooleanType(), False),
        StructField("SBCMessageToCustomer", BooleanType(), False),
        StructField("ToSBCAW", BooleanType(), False),
        StructField("FromSBCAW", BooleanType(), False),
        StructField("MessageTitle", StringType(), False),
        StructField("MessageSubmitDate", DateType(), False),
        StructField("Ack", BooleanType(), False),
        # ---------
        StructField("UniversalKey", IntegerType(), False),
        StructField("HoursPast", IntegerType(), False),
        StructField("LastUpdate", TimestampType(), False),
        StructField("PermReq:", BooleanType(), False),
        StructField("DamageReport:", BooleanType(), False)
        # StructField("C3:", BooleanType(), False),
        # StructField("C4:", BooleanType(), False),
        # StructField("C5:", BooleanType(), False)
        ])
    return schema


def permReq(data, externalReq):
    data = data.lower()
    perm = "permanent" in data
    req = "request" in data
    rdaf = "rdaf" in data
    rf = "rf" in data
    disregard = "disregard" in data
    request = rf or req
    clarification = "clarification" in data
    repairInstr = "repair" in data and "instruction" in data
    notDisqualified = (not (disregard or clarification)) and (externalReq)
    permanentReq = ((request and rdaf) or (request and perm) or (perm and rdaf) or (request and repairInstr)) and notDisqualified
    return permanentReq


def damageReport(data):
    data = data.lower()
    keywords = ["damage", "report", "preliminary", "prelim", "initial"]
    keywordBool = False
    i = 0
    while (i < len(keywords) and (not keywordBool)):
        keywordBool = keywords[i] in data
        i += 1
    return keywordBool

