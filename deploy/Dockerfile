# Build EDC v0.8.1 connector with DSP protocol support
# EDC v0.8.1 includes mature DSP modules and working launchers

ARG EDC_REF=v0.8.0

FROM gradle:8.10.2-jdk17 AS builder
ARG EDC_REF
WORKDIR /workspace

RUN git clone --depth 1 --branch "${EDC_REF}" https://github.com/eclipse-edc/Connector.git connector
WORKDIR /workspace/connector

# Build a standard EDC connector launcher that includes DSP protocol modules
# In v0.8.1, try the standard connector build from the root
RUN ./gradlew -DskipTests=true :system-tests:tck:dsp-tck-connector-under-test:installDist || \
    ./gradlew -DskipTests=true :launchers:generic:installDist || \
    ./gradlew -DskipTests=true :launchers:dpf:installDist

FROM eclipse-temurin:17-jre
WORKDIR /opt/edc

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Try to copy from DSP TCK connector first, fallback to other launchers
COPY --from=builder /workspace/connector/system-tests/tck/dsp-tck-connector-under-test/build/install/dsp-tck-connector-under-test/ /opt/edc/ 2>/dev/null || \
    COPY --from=builder /workspace/connector/launchers/generic/build/install/generic/ /opt/edc/ || \
    COPY --from=builder /workspace/connector/launchers/dpf/build/install/dpf/ /opt/edc/

# Expose standard EDC ports
EXPOSE 11000 11001 11002 11003

# Health check
HEALTHCHECK --interval=15s --timeout=5s --retries=20 \
  CMD curl --fail -X GET http://localhost:11000/api/check/health || exit 1

# Start the connector (determine which launcher was installed)
CMD [ \
  "/bin/sh", "-c", \
  "[ -f /opt/edc/bin/dsp-tck-connector-under-test ] && exec /opt/edc/bin/dsp-tck-connector-under-test || \
   [ -f /opt/edc/bin/generic ] && exec /opt/edc/bin/generic || \
   [ -f /opt/edc/bin/dpf ] && exec /opt/edc/bin/dpf || \
   exec java -jar /opt/edc/lib/*.jar" \
]
