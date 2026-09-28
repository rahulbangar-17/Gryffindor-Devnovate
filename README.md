# AI Agents That Learn Using Hindsight

## 1. Team Details

| Field | Details |
| :--- | :--- |
| **Team Name** | GRYFFINDOR |
| **Team Members (5)** | 1. S. Rahul Bangar<br>2. S. Guru Poojitha<br>3. M. Spurthi<br>4. S. Sarasij Reddy<br>5. P. Sudeshna Reddy |
| **Project Title** | AI Agents That Learn Using Hindsight |
# AI Agents That Learn Using Hindsight

## 1. Team Details

| Field | Details |
| :--- | :--- |
| **Team Name** | GRYFFINDOR |
| **Team Members (5)** | 1. S. Rahul Bangar<br>2. S. Guru Poojitha<br>3. M. Spurthi<br>4. S. Sarasij Reddy<br>5. P. Sudeshna Reddy |
| **Project Title** | AI Agents That Learn Using Hindsight |
| **GitHub Repository Link** | Add your GitHub repository link here |

---

## 2. Repository Structure

Our repository is organized into separate frontend and backend components to make the project easy to understand, run, and evaluate.

* `/backend` — Contains the FastAPI backend responsible for AI conversations, Hindsight memory, document processing, vector retrieval, feedback, and database operations.
    * `/app/main.py` — Main FastAPI application containing the API endpoints and AI processing pipeline.
    * `requirements.txt` — Contains the Python dependencies required to run the backend.
* `/frontend` — Contains the user interface for interacting with the AI assistant.
    * `/src` — Frontend application source code.
    * `package.json` — Contains frontend dependencies and project configuration.
* `/.env` — Contains configuration values and API credentials required by the application. This file should not be uploaded publicly.

---

## 3. Problem Understanding

Most conventional AI chat applications have limited memory and mainly depend on the current conversation. Although Retrieval-Augmented Generation systems can retrieve information from documents, they generally do not provide a persistent understanding of the user's previous interactions.

This creates a limitation when users want an AI assistant that can remember useful information such as their projects, preferences, goals, previous decisions, or earlier conversations.

At the same time, blindly retrieving every stored memory can introduce irrelevant information into the AI's context. For example, a simple greeting such as "hi" should not cause the assistant to recall unrelated information from previous conversations.

Our project addresses this problem by combining RAG with selective long-term memory using Vectorize Hindsight.

---

## 4. Proposed Solution

We developed an AI assistant that combines three important sources of context: the current conversation, long-term memory, and information retrieved from uploaded documents.

The system uses Vectorize Hindsight as the long-term memory layer. Instead of retrieving memories for every query, the backend first determines whether the current request actually requires previous context.

For general questions such as "What is inheritance in Java?", the assistant can respond without accessing long-term memory. For questions such as "What did we discuss yesterday?" or "Continue my previous project", the system can retrieve relevant information from Hindsight.

The application also supports document-based question answering through RAG. Uploaded PDF, DOCX, and TXT files are processed, converted into embeddings, and stored in Qdrant. Relevant document sections are retrieved when required and passed to the language model.

This allows the AI assistant to use the right source of information for the right type of query.

---

## 5. Approach & Methodology

### 5.1 Selective Memory Retrieval

The most important part of the system is the selective memory decision layer.

Before querying Hindsight, the backend examines the user's request and identifies whether previous information is likely to be useful. Explicit references to previous conversations, personal preferences, projects, goals, or earlier decisions can activate long-term memory retrieval.

Simple queries and general knowledge questions are handled without unnecessary Hindsight retrieval.

This prevents unrelated memories from being injected into the model's context and makes the memory system more controlled.

### 5.2 Retrieval-Augmented Generation

The RAG pipeline is responsible for answering questions based on user-uploaded documents.

When a document is uploaded, its content is extracted and divided into smaller chunks. Embeddings are generated for these chunks and stored in Qdrant.

When the user asks a document-related question, the system performs semantic vector search and retrieves the most relevant document sections. These sections are then provided to the language model as document context.

### 5.3 Long-Term Memory Retention

The system does not retain every conversation message as permanent memory.

Instead, it identifies information that may be useful in future interactions, such as user goals, preferences, projects, study plans, and other durable context.

This allows Hindsight to maintain useful long-term information while avoiding unnecessary conversational noise.

### 5.4 Conversation Context

Recent messages from the current conversation are stored in PostgreSQL and supplied to the language model as short-term context.

The final response can therefore be generated using the current conversation together with relevant long-term memories and retrieved document information.

---

## 6. System Architecture

The overall system follows a layered architecture in which the frontend communicates with the FastAPI backend. The backend determines which sources of information are required before generating the response.

```text
                         User
                          |
                          v
                     Frontend UI
                          |
                          v
                    FastAPI Backend
                          |
             +------------+------------+
             |            |            |
             v            v            v
       Memory Layer   RAG Layer    Database Layer
             |            |            |
             v            v            v
         Hindsight      Qdrant      PostgreSQL
             |            |            |
             +------------+------------+
                          |
                          v
                    Context Builder
                          |
                          v
                         LLM
                          |
                          v
                    Final Response

---

## 2. Repository Structure

Our repository is organized into separate frontend and backend components to make the project easy to understand, run, and evaluate.

* `/backend` — Contains the FastAPI backend responsible for AI conversations, Hindsight memory, document processing, vector retrieval, feedback, and database operations.
    * `/app/main.py` — Main FastAPI application containing the API endpoints and AI processing pipeline.
    * `requirements.txt` — Contains the Python dependencies required to run the backend.
* `/frontend` — Contains the user interface for interacting with the AI assistant.
    * `/src` — Frontend application source code.
    * `package.json` — Contains frontend dependencies and project configuration.
* `/.env` — Contains configuration values and API credentials required by the application. This file should not be uploaded publicly.

---

## 3. Problem Understanding

Most conventional AI chat applications have limited memory and mainly depend on the current conversation. Although Retrieval-Augmented Generation systems can retrieve information from documents, they generally do not provide a persistent understanding of the user's previous interactions.

This creates a limitation when users want an AI assistant that can remember useful information such as their projects, preferences, goals, previous decisions, or earlier conversations.

At the same time, blindly retrieving every stored memory can introduce irrelevant information into the AI's context. For example, a simple greeting such as "hi" should not cause the assistant to recall unrelated information from previous conversations.

Our project addresses this problem by combining RAG with selective long-term memory using Vectorize Hindsight.

---

## 4. Proposed Solution

We developed an AI assistant that combines three important sources of context: the current conversation, long-term memory, and information retrieved from uploaded documents.

The system uses Vectorize Hindsight as the long-term memory layer. Instead of retrieving memories for every query, the backend first determines whether the current request actually requires previous context.

For general questions such as "What is inheritance in Java?", the assistant can respond without accessing long-term memory. For questions such as "What did we discuss yesterday?" or "Continue my previous project", the system can retrieve relevant information from Hindsight.

The application also supports document-based question answering through RAG. Uploaded PDF, DOCX, and TXT files are processed, converted into embeddings, and stored in Qdrant. Relevant document sections are retrieved when required and passed to the language model.

This allows the AI assistant to use the right source of information for the right type of query.

---

## 5. Approach & Methodology

### 5.1 Selective Memory Retrieval

The most important part of the system is the selective memory decision layer.

Before querying Hindsight, the backend examines the user's request and identifies whether previous information is likely to be useful. Explicit references to previous conversations, personal preferences, projects, goals, or earlier decisions can activate long-term memory retrieval.

Simple queries and general knowledge questions are handled without unnecessary Hindsight retrieval.

This prevents unrelated memories from being injected into the model's context and makes the memory system more controlled.

### 5.2 Retrieval-Augmented Generation

The RAG pipeline is responsible for answering questions based on user-uploaded documents.

When a document is uploaded, its content is extracted and divided into smaller chunks. Embeddings are generated for these chunks and stored in Qdrant.

When the user asks a document-related question, the system performs semantic vector search and retrieves the most relevant document sections. These sections are then provided to the language model as document context.

### 5.3 Long-Term Memory Retention

The system does not retain every conversation message as permanent memory.

Instead, it identifies information that may be useful in future interactions, such as user goals, preferences, projects, study plans, and other durable context.

This allows Hindsight to maintain useful long-term information while avoiding unnecessary conversational noise.

### 5.4 Conversation Context

Recent messages from the current conversation are stored in PostgreSQL and supplied to the language model as short-term context.

The final response can therefore be generated using the current conversation together with relevant long-term memories and retrieved document information.

---

## 6. System Architecture

The overall system follows a layered architecture in which the frontend communicates with the FastAPI backend. The backend determines which sources of information are required before generating the response.

```text
                         User
                          |
                          v
                     Frontend UI
                          |
                          v
                    FastAPI Backend
                          |
             +------------+------------+
             |            |            |
             v            v            v
       Memory Layer   RAG Layer    Database Layer
             |            |            |
             v            v            v
         Hindsight      Qdrant      PostgreSQL
             |            |            |
             +------------+------------+
                          |
                          v
                    Context Builder
                          |
                          v
                         LLM
                          |
                          v
                    Final Response
