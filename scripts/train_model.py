import joblib
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

texts = [
    "I love this",
    "This is amazing",
    "What a great experience",
    "I really like it",
    "This is wonderful",
    "I hate this",
    "This is terrible",
    "What a horrible experience",
    "I really dislike it",
    "This is awful",
]

labels = [
    "positive",
    "positive",
    "positive",
    "positive",
    "positive",
    "negative",
    "negative",
    "negative",
    "negative",
    "negative",
]

model = Pipeline([
    ("vectorizer", CountVectorizer()),
    ("classifier", LogisticRegression()),
])

model.fit(texts, labels)

joblib.dump(model, "sentiment-model.joblib")

print("Model saved to sentiment-model.joblib")