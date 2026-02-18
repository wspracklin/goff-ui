from openfeature import api

client = api.get_client()

dark_mode = client.get_boolean_value("dark-mode", False)
welcome = client.get_string_value("welcome-msg", "hello")
rate = client.get_float_value("sample-rate", 0.5)
count = client.get_integer_value("retry-count", 3)
config = client.get_object_value("app-config", {})
