"""
Presidio sidecar — production-grade PII redaction service.

Start: uvicorn main:app --host 0.0.0.0 --port 8100
"""
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="presidio-redact-sidecar")

_analyzer = AnalyzerEngine()
_anonymizer = AnonymizerEngine()

_OPERATORS = {
    "EMAIL_ADDRESS": OperatorConfig("replace", {"new_value": "[REDACTED_EMAIL]"}),
    "PHONE_NUMBER": OperatorConfig("replace", {"new_value": "[REDACTED_PHONE]"}),
    "PERSON": OperatorConfig("replace", {"new_value": "[REDACTED_PERSON]"}),
    "CREDIT_CARD": OperatorConfig("replace", {"new_value": "[REDACTED_CC]"}),
    "US_SSN": OperatorConfig("replace", {"new_value": "[REDACTED_SSN]"}),
    "IP_ADDRESS": OperatorConfig("replace", {"new_value": "[REDACTED_IP]"}),
    "DEFAULT": OperatorConfig("replace", {"new_value": "[REDACTED]"}),
}


class RedactRequest(BaseModel):
    text: str


class RedactResponse(BaseModel):
    redacted: str


@app.post("/redact", response_model=RedactResponse)
def redact(req: RedactRequest) -> RedactResponse:
    results = _analyzer.analyze(text=req.text, language="en")
    anonymized = _anonymizer.anonymize(
        text=req.text,
        analyzer_results=results,
        operators=_OPERATORS,
    )
    return RedactResponse(redacted=anonymized.text)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
