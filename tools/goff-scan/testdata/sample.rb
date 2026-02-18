require 'openfeature/sdk'

client = OpenFeature::SDK.build_client

enabled = client.fetch_boolean_value('ruby-feature', false)
label = client.fetch_string_value('label-text', 'default')
limit = client.fetch_number_value('rate-limit', 100)
config = client.fetch_object_value('ruby-config', {})
