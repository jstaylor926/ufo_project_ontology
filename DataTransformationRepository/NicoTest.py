from pyspark.sql import Row, SparkSession
from pyspark.sql.functions import col, udf
from pyspark.sql.types import StructType, StructField, StringType, IntegerType
from pyspark.sql.types import DateType, BooleanType, ArrayType, TimestampType
from transforms.api import Input, Output, transform
from datetime import date

# V2 forward-compatibility shim. See DataTransformationRepository/v2_compat.py.
from v2_compat import maybe_normalize_dossier_index

# Builds a data set for UFOentry Objects
# Comments are made above the line of code they are pertinent to
icaoSeen = {}


@transform(
    outputData=Output("ri.foundry.main.dataset.3a37542a-30c7-4bff-acd9-325349bd6656"),
    source_df=Input("ri.foundry.main.dataset.4fb9fb8b-8c67-4c1f-8998-42eab848793f"),
)
# compute function
def compute(outputData, source_df):
    # setting up Spark environment
    spark = SparkSession.builder.appName("UFOAPP").config("spark.driver.cores", "4")\
        .config("spark.driver.memory", "10g")\
        .config("spark.executor.cores", "4")\
        .config("spark.executor.memory", "6g").getOrCreate()

    source_df = source_df.dataframe()
    # V2 forward-compat — rename V2 columns to V1 spelling.
    source_df = maybe_normalize_dossier_index(source_df)
    source_df = source_df.select("operatorICAOCode")
    Rows = source_df.collect() # noqa
    for each in Rows: 
        data = ""
        if each[0] is None: 
            data = "None"
        else:
            data = each[0]
        if data in icaoSeen:
            icaoSeen[data] += 1
        else: 
            icaoSeen[data] = 1
    schema = StructType([
        StructField("ICAO_code", StringType(), False),
        StructField("A320Count", IntegerType(), False)])
    entryArr = []
    for each in icaoSeen.keys() :
        vals = [each, icaoSeen[each]]
        row = Row(*vals)
        entryArr.append(row)
    ret = spark.createDataFrame(entryArr, schema)
    outputData.write_dataframe(ret)
