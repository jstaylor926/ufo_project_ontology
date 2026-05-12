from pyspark.sql import Row, SparkSession
from pyspark.sql.functions import col, udf
from pyspark.sql.types import StructType, StructField, StringType, IntegerType
from pyspark.sql.types import DateType, BooleanType, ArrayType, TimestampType
from transforms.api import Input, Output, transform
from datetime import date

# Builds a data set for UFOentry Objects
# Comments are made above the line of code they are pertinent to
msnSeen = {}


@transform(
    outputData=Output("ri.foundry.main.dataset.90e0838b-22bf-4e38-b844-5e7a12da5616"),
    rtsData=Output("ri.foundry.main.dataset.129453a9-4750-4fd0-b479-75559220a62d"),
    source_df=Input("ri.foundry.main.dataset.5699f900-eace-4065-ad42-7a61cab94c0b"),
)
# compute function
def compute(outputData, rtsData, source_df):
    # setting up Spark environment
    spark = SparkSession.builder.appName("UFOAPP").config("spark.driver.cores", "4")\
        .config("spark.driver.memory", "10g")\
        .config("spark.executor.cores", "4")\
        .config("spark.executor.memory", "6g").getOrCreate()

    # building the column Schema for the output data set
    schemaSet = schemaSetGen()
    schemaSet2 = schemaSetGen2()
    # pull datframe from INPUT data set
    source_df = source_df.dataframe()

    # The collect method is used to retrieve all the data from the source_df dataframe and returns it as a local list
    Rows = source_df.collect()  # noqa
    # entryArr will hold all the rows that comprise the OUTPUT data set
    interArr = []
    entryArr = []
    rtsArr = []
    # columnHeaders will hold the columnHeaders, essentially the schemaSet, from the INPUT data set
    columnHeaders = []

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
        interRow = Transformation1(each, columnHeaders)
        # adding the generated row to entryArr, initialized earlier
        interArr.append(interRow)
    index = schemaSet.names.index("MSN_RTS")
    msnIndex = schemaSet.names.index("MSN")
    for r in interArr:
        row = Transformation2(r, index, msnIndex)
        entryArr.append(row)

    for each in msnSeen:
        row = Row(each, msnSeen[each])
        rtsArr.append(row)
    # creates dataframe with array of rows and defined schemaSet
    # SchemaSet defines the columnHeaders and dataTypes
    rtsRet = spark.createDataFrame(rtsArr, schemaSet2)
    ret = spark.createDataFrame(entryArr, schemaSet)
    # ret = Transformation2(inter)
    # populates the output dataset with the created dataframe
    rtsData.write_dataframe(rtsRet)
    outputData.write_dataframe(ret)


# Transformation function
# @param entry : Row object, single row from INPUT data set
# @param columnHeaders: String Array, holds all the column names from INPUT data set
def Transformation1(entry, columnHeaders):
    # defines the column names frm the INPUT data set that hold integers or integer Arrays
    integerColumns = ["msn", "aircraftFlightHours", "aircraftFlightCycles", "componentFlightCycles",
                      "componentFlightHours", "ataChapter", "ata4D"]

    #defaultYear = None
    # initializes vals1, an array that will hold all the values that will go into the output Row object
    vals1 = []
    # integer value added to the output Row object, initliazed very large so min() will choose other value
    #   used to calculate the most recent dossier action
    minDays = 200000
    recentDate = None
    # bool value that might be modifed later
    #   is added to the output Row object
    backOfficeClosed = False

    # both values initialized so they can be added to the ouput Row object.
    #   They might hold a date object but might also stay as None objects
    newReqDate = None
    rts = None

    msnStr = []
    #scrapedMSN = None
    rdafDelivered = False
    repairInstrProv = False
    ESG = False
    ITD = False
    ALTEN = False
    # currentHrs = []
    # currentFlightCycs = []
    # numMessages = None
    # closedMessages = None

    # for loop going thru every column within the @param: entry Row object.
    #       entry[it] : cell value
    for it in range(0, len(entry)):
        data = entry[it]
        columnHead = columnHeaders[it]

        # sets the backOfficeClosed (defined above) to True if the dossier has been closed by the Back Office
        #   this boolean is used later in the Ontology to mark userClosed dossiers as actually Closed
        #        once the Back Office has closed them on the back end
        #   the dossierStatus is the only column that holds values 'CLSD' and 'OPEN'
        #       this if block is implicitly saying "if (columndHeader == dossierStatus && data == CLSD)"
        if (data == "CLSD"):
            backOfficeClosed = True

        if (columnHead == "operatorICAOCode"):
            if (data == "USA"):
                data = "AAL"
        # this if block pulls the Return to Service date out of the Label field
        if ((columnHead == "dossierLabel") & (data != None)):
            if ("RTS" in data):
                rts = scrapeRTS(data)
            arr2 = altenESGITDCheck(data)
            ALTEN = arr2[0] or ALTEN
            ESG = arr2[1] or ESG
            ITD = arr2[2] or ITD
        # checks date type columns against the Minimum days
        if ((str(type(data)) == "<class 'datetime.datetime'>")):
            # if columnHead is not messSoonestRqDate, it is a doss Action Item (dossUpdateDate, dossSubmitDate, etc)
            if ((columnHead != "messageSoonestRequestDate")):
                # sets minDays as minimum of all Dossier Action Items
                compare = minDays
                minDays = min(minDays, ((data.today().date() - data.date()).days))
                if (compare != minDays):
                    recentDate = data

            # If columnHead is messSoonestRqDate, populate the newRqDate with data
            # this is just a placeholder for now
            # ideally, FSRs, will update this field through the dashboard, when applicable
            else:
                newReqDate = data
        # if (columnHead == "skywise_aircraft_id") :
        #     scrapedMSN = scrapeMSNfromID(data)

        if ((columnHead == "msn") & (data != None)):
            for msn in data:
                if not (rts == None):
                    try:
                        currDate = msnSeen[msn]
                        if (rts > currDate) :
                            msnSeen[msn] = rts
                    except KeyError:
                        msnSeen[msn] = rts
            if not (data == None):
                for each in data:
                    msnStr.append(str(each))

        if (columnHead == "approval_doc_type"):
            if (data == None):
                rdafDelivered = False
                repairInstrProv = False
            else:
                rdafDelivered = "RDAF" in data
                repairInstrProv = (("TD" in data))

        if (columnHead == "dossierTitle"):
            arr = altenESGITDCheck(data)
            ALTEN = arr[0] or ALTEN
            ESG = arr[1] or ESG
            ITD = arr[2] or ITD
        # action on evert integer column
        # columns currently holding string values
        # convert strings to int and convert string[] to int[]
        if (columnHead in integerColumns):
            if (isinstance(data, list)):
                for i in data:
                    data[data.index(i)] = int(i)
            elif (data != None):
                data = int(data)
        # adds the current data to vals1, defined above
        vals1.append(data)

    # these are all the fields that aren't explicitly defined in the INPUT row
    vals1.append(entry[0])  # dossID appended again so there is a string and int version in OUTPUT row
    vals1.append(None)  # default AircraftStatus value
    vals1.append(None)  # default Focal value
    vals1.append(recentDate)  # represents the number of days since most recent Dossier Action, defined above
    vals1.append(newReqDate)  # represents the new message Soonest Request Date, defined above
    vals1.append(0)  # default value for Priority Score
    vals1.append([""])  # empty string array for comments through the dashboard
    vals1.append([""])
    vals1.append(rts)  # represents the Return to Service date scraped from Label, defined and edited above
    vals1.append(rts)
    vals1.append(False)  # boolean for isFavorite, used to isolate FSR favorite dossiers in dashboard
    vals1.append(backOfficeClosed)  # boolean for backOfficeClosed, defined and edited above
    vals1.append(0)  # default value for SBC bump
    vals1.append(None)  # default value for TR status

    # ____________ escalations __________
    vals1.append(False)
    vals1.append(False)
    vals1.append(False)
    vals1.append(False)

    vals1.append(None)
    vals1.append(None)
    vals1.append(None)

    vals1.append(None)
    vals1.append(None)
    vals1.append(None)

    vals1.append(msnStr)
    vals1.append(rdafDelivered)
    vals1.append(repairInstrProv)
    vals1.append(ALTEN)
    vals1.append(ESG)
    vals1.append(ITD)
    return vals1  # returns Row object


def Transformation2(entry, index, msnIndex):
    data = entry[msnIndex]
    val = retMsnRTS(data)
    entry[index] = val
    r = Row(*entry)
    return r
    # msnRtsUDF = udf(retMsnRTS, DateType())
    # ret = dataframeParam.withColumn("rts-msn", msnRtsUDF(col("MSN")))
    # return ret
    # dataframe = dataframeParam.select("MSN-RTS", "MSN", "Dossier_ID").collect()
    #   for each in datafr


def retMsnRTS(MSNs):
    if MSNs == None:
        return None
    retDate = None
    for each in MSNs:
        try:
            date = msnSeen[each]
            if retDate == None:
                retDate = date
            else:
                if (retDate < date):
                    retDate = date
        except KeyError:
            x = 0
            x = x+1
    return retDate


# defines SchemaSet
# each column is defined with a StructField
# StructField syntax: (String: Column Name, Type: columnType, Boolean: nullable (will the column accept a null value))
def schemaSetGen():
    schema = StructType([
        StructField("Dossier_ID", StringType(), True),
        StructField("Internal_Id", StringType(), True),
        StructField("Domain", StringType(), True),
        StructField("Title", StringType(), True),
        StructField("Label", StringType(), True),
        StructField("Channel", StringType(), True),
        StructField("Dossier_isMigrated", BooleanType(), True),
        StructField("Status", StringType(), True),
        StructField("Program_Letter", StringType(), True),
        StructField("Program", StringType(), True),
        StructField("AircraftID", StringType(), True),
        StructField("Skywise_AircraftID", StringType(), True),
        StructField("isapplicable_forAll_MSN", BooleanType(), True),
        StructField("MSN", ArrayType(IntegerType()), True),
        StructField("Aircraft_Type", StringType(), True),
        StructField("Aircraft_Model", StringType(), True),
        StructField("Registration_Number", StringType(), True),                # Defines the datatype for each field
        StructField("Aircraft_Flighthrs", IntegerType(), True),
        StructField("Aircraft_Flightcycs", IntegerType(), True),
        StructField("operator_ICAO", StringType(), True),
        StructField("engineSeries", StringType(), True),
        StructField("engineModel", StringType(), True),
        StructField("component_SerialNum", StringType(), True),
        StructField("component_PartNum", StringType(), True),
        StructField("component_Flightcycs", IntegerType(), True),
        StructField("component_FlightHrs", IntegerType(), True),
        StructField("component_FIN", StringType(), True),
        StructField("ata_Chapter", ArrayType(IntegerType()), True),
        StructField("ata_4d", ArrayType(IntegerType()), True),
        StructField("Dossier_Requestor_ICAO", StringType(), True),
        StructField("Dossier_VisbleBy_ICAO", StringType(), True),
        StructField("Dossier_CreationDate", DateType(), True),
        StructField("Dossier_UpDate", TimestampType(), True),
        StructField("Dossier_SubmitDate", TimestampType(), True),
        StructField("Dossier_ClosureDate", TimestampType(), True),
        StructField("nb_TotalMessages", IntegerType(), True),
        StructField("nb_ClosedMessages", IntegerType(), True),
        StructField("Message_Soonest_ReqDate", DateType(), True),
        StructField("highest_Message_Urgency", StringType(), True),
        StructField("Message_Open", BooleanType(), True),
        StructField("has_Approval_Doc", BooleanType(), True),
        StructField("Approval_DocType", StringType(), True),
        # _____________________________________________________________________
        # the rest of the fields do NOT come from the parent dataset
        # _____________________________________________________________________
        StructField("UniversalKey", IntegerType(), True),
        StructField("AircraftStatus", StringType(), True),
        StructField("Focal", StringType(), True),
        StructField("MostRecentAction", TimestampType(), True),
        StructField("New_Request_Date", DateType(), True),
        StructField("GlobalScore", IntegerType(), True),
        StructField("Comments", ArrayType(StringType()), True),
        StructField("LinkedComments", ArrayType(StringType()), True),
        StructField("RTS", DateType(), True),
        StructField("MSN_RTS", DateType(), True),
        StructField("isFavorite", BooleanType(), True),
        StructField("ClosedbyBackOffice", BooleanType(), False),
        StructField("SBCBump", IntegerType(), False),
        StructField("TR_Status", StringType(), True),

        StructField("InternalEscalation", BooleanType(), False),
        StructField("CustomerEscalation", BooleanType(), False),
        StructField("PartsEscalation", BooleanType(), False),
        StructField("LeadershipFlag", BooleanType(), False),

        StructField("IntEsc_Date", TimestampType(), True),
        StructField("CusEsc_Date", TimestampType(), True),
        StructField("PartsEsc_Date", TimestampType(), True),

        StructField("InternalEscalation_ByUser", StringType(), True),
        StructField("CustomerEscalation_ByUser", StringType(), True),
        StructField("PartsEscalation_ByUser", StringType(), True),

        StructField("MSN_Filter", ArrayType(StringType()), True),
        StructField("RDAF_Delivered", BooleanType(), False),
        StructField("RepairInstrProvided", BooleanType(), False),
        StructField("ALTEN", BooleanType(), False),
        StructField("ESG", BooleanType(), False),
        StructField("ITD", BooleanType(), False)
        ])
    return schema


def schemaSetGen2() :
    schema = StructType([
        StructField("MSN", IntegerType(), False),
        StructField("RTS", DateType(), True)
        ])
    return schema


# Dictionary like method for RTS date scraping
# returns number corresponding to month chars passed in
def dictionaryMonthtoInt(month):
    month = month.upper()
    if ((month == "JAN") | (month == "JANUARY")):
        return 1
    elif ((month == "FEB") | (month == "FEBRUARY")):
        return 2
    elif ((month == "MAR") | (month == "MARCH")):
        return 3
    elif ((month == "APR") | (month == "APRIL")):
        return 4
    elif (month == "MAY"):
        return 5
    elif ((month == "JUN") | (month == "JUNE")):
        return 6
    elif ((month == "JUL") | (month == "JULY")):
        return 7
    elif ((month == "AUG") | (month == "AUGUST")):
        return 8
    elif ((month == "SEP") | (month == "SEPTEMBER")):
        return 9
    elif ((month == "OCT") | (month == "OCTOBER")):
        return 10
    elif ((month == "NOV") | (month == "NOVEMBER")):
        return 11
    elif ((month == "DEC") | (month == "DECEMBER")):
        return 12
    else:
        return 0
    return 0


def altenESGITDCheck(data):
    boolReturns = [False, False, False]
    if data is None:
        return boolReturns
    if "ALTEN" in data:
        boolReturns[0] = True
    if "ESG" in data:
        boolReturns[1] = True
    if "ITD" in data:
        boolReturns[2] = True
    return boolReturns


def scrapeRTS(data):
    rts = None
    # this scraping method assumes that the data will be in the format DD/MMM/YYYY
    #   ex: "RTS: 26-SEP-2000" becomes "RTS26SEP2000"
    #   months are identified by 3 chars in function defined below
    #   date object is build below
    holder = data.replace(" ", "")
    holder = holder.replace("-", "")
    holder = holder.replace("/", "")
    holder = holder.replace(":", "")
    holder = holder.replace(".", "")
    holder = holder.replace(",", "")
    index = holder.index("RTS")
    day = holder[index+3:index+5]
    month = holder[index+5:index+8]
    year = holder[index+8: index+12]
    # most common break from standard format is 2 chars for year
    # if original scraping method doesn't work, tries to build date object with current year
    # if both methods fail, the rts field is left as null
    try:
        if int(year) < 100:
            year = '20' + year
        if (int(year) < 2010) | (int(year) > 2030):
            rts = None
        else:
            rts = date(int(year), dictionaryMonthtoInt(month), int(day))
    except ValueError:
        try:
            rts = date(date.today().year, dictionaryMonthtoInt(month), int(day))
        except ValueError:
            rts = None
    return rts


def scrapeMSNfromID(AircraftIDs):
    MSNs = []
    if (AircraftIDs is None) :
        return MSNs
    for aircraftID in AircraftIDs:
        try:
            index = aircraftID.index("-")
            MSNs.append(int(aircraftID[index+1:]))
        except ValueError:
            pass
    return MSNs
