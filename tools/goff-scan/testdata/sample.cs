using OpenFeature;

var client = Api.Instance.GetClient();

var enabled = await client.GetBooleanValueAsync("dotnet-flag", false);
var name = await client.GetStringValueAsync("app-name", "default");
var score = await client.GetDoubleValueAsync("score-threshold", 0.5);
var retries = await client.GetIntegerValueAsync("max-retries", 3);
var config = await client.GetObjectValueAsync("service-config", null);
