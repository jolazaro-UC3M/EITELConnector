# Use pre-built EDC image (mariwogr/eitel:v1) as base
# The DSP JARs are included but may need proper configuration to register the dispatcher

FROM mariwogr/eitel:v1

# Append DSP configuration to ensure protocol dispatcher is registered
# If the config file doesn't exist, these settings will be added at startup
RUN echo "" >> /opt/edc/dataspaceconnector-configuration.properties && \
    echo "# DSP Protocol Configuration - ensures dispatcher is registered" >> /opt/edc/dataspaceconnector-configuration.properties && \
    echo "edc.web.http.protocol.path=/api/v1/dsp" >> /opt/edc/dataspaceconnector-configuration.properties && \
    echo "edc.protocol.dsp.http.enabled=true" >> /opt/edc/dataspaceconnector-configuration.properties && \
    echo "edc.dsp.protocol.enabled=true" >> /opt/edc/dataspaceconnector-configuration.properties

# Expose standard EDC ports
EXPOSE 11000 11001 11002 11003
