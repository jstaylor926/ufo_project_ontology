from pyspark.sql import Row, SparkSession
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, BooleanType
from transforms.api import Input, Output, transform

# Builds a data set for ICAO Objects
# this build mostly just creates a template for the ICAO objects as most of the deditting will be done through the
#       Onotology and Ontology actions, which allows for a more dynamic usage of ICAO objects
# Comments are made above the line of code they are pertinent to


@transform(
    source_df=Input("ri.foundry.main.dataset.90e0838b-22bf-4e38-b844-5e7a12da5616"),
    outputData=Output("ri.foundry.main.dataset.6c90f9a8-5399-4852-89d2-faf32ad5d16f"),
)
def driver(outputData, source_df):
    # setting up Spark environment
    spark = SparkSession.builder.appName("UFOAPP").config("spark.driver.cores", "4")\
        .config("spark.driver.memory", "10g")\
        .config("spark.executor.cores", "4")\
        .config("spark.executor.memory", "6g").getOrCreate()
    # building the column Schema for the output data set
    schemaSet = schemaSetGen()
    # pull datframe from INPUT data set
    source_df = source_df.dataframe()
    # selects relevant columns from INPUT dataset
    icaos = source_df.select(['operator_ICAO', 'Status', 'Priority']).collect()  # noqa
    # initializes empty dictionary
    seen = {}
    # itwerates overy very row pulled from INPUT dataset, done above
    for icao in icaos:
        # adds new ICAOS to seen dictionary
        # icao[0] : icao string ex: 'DAL'
        if icao[0] not in seen:
            # array of zeros initialized, mostly just a blank template for Ontology
            seen[icao[0]] = [0, 0, 0, 0, 0]
    # purely for validation
    count = 0
    # rows[] array initliazed to hold the Row objects that will be created
    rows = []
    # stores the Null values as a new dictionary entry
    # "NullValue"  as a string causes fewer issues than None object
    seen["NullVal"] = seen.pop(None)
    # itereates over every unique ICAO code seen earlier
    for each in seen:
        # initializes vals, an array that will hold all the values that will go into the output Row object
        vals = []
        # purely for validation
        count += seen[each][0] + seen[each][1]
        # adds ICAO char sequence
        vals.append(each)
        for it in seen[each]:
            # adds each 0 value for the Integer fields in the SchemaSet
            vals.append(it)
        # adds default boolean values for Cap Met fields
        vals.append(False)
        vals.append(False)
        # produces a Row object from the vals array
        r = Row(*vals)
        # adds Row object to an array holding rows
        rows.append(r)
    # creates dataframe with array of rows and defined schemaSet
    # SchemaSet defines the columnHeaders and dataTypes
    ret = spark.createDataFrame(rows, schemaSet)
    # populates the output dataset with the created dataframe
    outputData.write_dataframe(ret)


# defines SchemaSet
# each column is defined with a StructField
# StructField syntax: (String: Column Name, Type: columnType, Boolean: nullable (will the column accept a null value))


def schemaSetGen():
    schema = StructType([
        StructField("ICAO", StringType(), True),
        StructField("OPENCount", IntegerType(), True),
        StructField("ClosedCount", IntegerType(), True),
        StructField("AmbersAlloted", IntegerType(), True),
        StructField("AmberCount", IntegerType(), True),
        StructField("RedCount", IntegerType(), True),
        StructField("RedCapMet", BooleanType(), True),
        StructField("AmberCapMet", BooleanType(), True)
        ])
    return schema
