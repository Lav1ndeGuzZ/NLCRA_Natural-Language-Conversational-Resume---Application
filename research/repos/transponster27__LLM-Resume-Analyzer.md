<p align="center">
  <img src="assets/banner.png" alt="LLM Resume Analyzer Banner" width="100%" />
</p>

<h1 align="center">LLM Resume Analyzer</h1>

<p align="center">
  AI-powered resume analysis and semantic job matching using LLMs and vector similarity.
</p>

<hr />

<h2>Live Demo</h2>

<p>
  <strong>Application URL:</strong><br />
  <a href="https://your-app-name.streamlit.app" target="_blank">
    https://your-app-name.streamlit.app
  </a>
</p>

<p>
  The application runs in mock mode by default if no API key is provided.
</p>

<hr />

<h2>Overview</h2>

<p>
Recruiters often rely on keyword-based systems that fail to capture semantic meaning within resumes.
For example:
</p>

<ul>
  <li>"Machine Learning Engineer" is contextually similar to "AI Specialist"</li>
  <li>"Built REST APIs" aligns with "Developed backend services"</li>
</ul>

<p>
Traditional filtering methods do not understand contextual similarity.
This project demonstrates how large language models combined with semantic similarity
can automate first-pass resume screening in a modular and production-ready system.
</p>

<hr />

<h2>Core Functionality</h2>

<p>The system allows users to:</p>

<ul>
  <li>Upload a resume in PDF format</li>
  <li>Paste a job description</li>
  <li>Extract structured candidate information</li>
  <li>Identify key technical skills</li>
  <li>Compute a semantic resume–job match score</li>
  <li>Generate alignment insights</li>
</ul>

<p>
Two operational modes are supported:
</p>

<ul>
  <li><strong>OpenAI Mode</strong> – Uses LLM-based extraction and embeddings</li>
  <li><strong>Mock Mode</strong> – Uses a lightweight offline baseline for portability</li>
</ul>

<hr />

<h2>System Architecture</h2>

<pre>
Resume (PDF)
      ↓
Text Extraction (pdfplumber)
      ↓
LLM Structured Extraction (OpenAI)
        OR
Mock Baseline Extraction
      ↓
Vector Representation
      ↓
Custom Cosine Similarity
      ↓
Match Score + Insights (Streamlit UI)
</pre>

<p>
The architecture is modular, allowing each component to be independently replaced or extended.
</p>

<hr />

<h2>Technical Stack</h2>

<table>
  <tr>
    <th>Layer</th>
    <th>Technology</th>
  </tr>
  <tr>
    <td>User Interface</td>
    <td>Streamlit</td>
  </tr>
  <tr>
    <td>LLM Extraction</td>
    <td>OpenAI GPT-4o-mini</td>
  </tr>
  <tr>
    <td>Vector Similarity</td>
    <td>Custom cosine similarity implementation</td>
  </tr>
  <tr>
    <td>PDF Parsing</td>
    <td>pdfplumber</td>
  </tr>
  <tr>
    <td>Environment Management</td>
    <td>python-dotenv</td>
  </tr>
  <tr>
    <td>Deployment</td>
    <td>Streamlit Cloud</td>
  </tr>
  <tr>
    <td>CI/CD</td>
    <td>GitHub Actions</td>
  </tr>
</table>

<hr />

<h2>Key Technical Design Decisions</h2>

<h3>1. LLM-Based Structured Extraction</h3>

<p>
Rather than relying on regex or rule-based parsing, the system leverages an LLM
to convert unstructured resume text into structured JSON including:
</p>

<ul>
  <li>Skills</li>
  <li>Roles</li>
  <li>Years of experience</li>
  <li>Education</li>
  <li>Summary</li>
</ul>

<h3>2. Semantic Resume–Job Matching</h3>

<p>
Resumes and job descriptions are represented as vectors and compared using cosine similarity.
</p>

<h4>OpenAI Mode</h4>
<ul>
  <li>Uses embedding model <code>text-embedding-3-small</code></li>
  <li>Captures contextual semantic meaning</li>
</ul>

<h4>Mock Mode</h4>
<ul>
  <li>Uses bag-of-words baseline similarity</li>
  <li>Runs without API key</li>
  <li>Fully portable across environments</li>
</ul>

<h3>3. Custom Cosine Similarity Implementation</h3>

<p>
To eliminate heavy native dependencies such as scikit-learn and SciPy,
cosine similarity is implemented manually:
</p>

<pre>
dot = sum(x*y for x, y in zip(a, b))
norm_a = sqrt(sum(x*x for x in a))
norm_b = sqrt(sum(y*y for y in b))
similarity = dot / (norm_a * norm_b)
</pre>

<p>
This improves portability and ensures cross-platform compatibility.
</p>

<h3>4. Production-Oriented Architecture</h3>

<ul>
  <li>Modular component separation</li>
  <li>Environment variable feature flags</li>
  <li>Graceful API fallback handling</li>
  <li>Secure secret management</li>
  <li>Continuous integration validation</li>
</ul>

<hr />

<h2>Example Output</h2>

<p><strong>Extracted Skills:</strong></p>

<pre>
["Python", "AWS", "Docker", "NLP", "FastAPI"]
</pre>

<p><strong>Match Score:</strong></p>

<pre>
78.4%
</pre>

<p><strong>Insight:</strong></p>

<pre>
Candidate demonstrates strong backend and ML experience aligned with role requirements.
</pre>

<hr />

<h2>Environment Configuration</h2>

<p>Create a <code>.env</code> file:</p>

<pre>
OPENAI_API_KEY=your_api_key_here
LLM_PROVIDER=openai
</pre>

<p>To run offline:</p>

<pre>
LLM_PROVIDER=mock
</pre>

<p>
Environment secrets are excluded from version control.
</p>

<hr />

<h2>Local Setup</h2>

<h3>1. Clone Repository</h3>

<pre>
git clone https://github.com/transponster27/LLM-Resume-Analyzer.git
cd LLM-Resume-Analyzer
</pre>

<h3>2. Create Virtual Environment</h3>

<pre>
python -m venv venv
venv\Scripts\activate
</pre>

<h3>3. Install Dependencies</h3>

<pre>
pip install -r requirements.txt
</pre>

<h3>4. Run Application</h3>

<pre>
python -m streamlit run app.py
</pre>

<hr />

<h2>Project Structure</h2>

<pre>
LLM-Resume-Analyzer/
│
├── app.py
├── analyzer.py
├── embeddings.py
├── similarity.py
├── resume_parser.py
├── requirements.txt
├── assets/
├── screenshots/
└── .github/workflows/
</pre>

<hr />

<h2>CI/CD</h2>

<p>
GitHub Actions workflow validates:
</p>

<ul>
  <li>Dependency installation</li>
  <li>Python syntax integrity</li>
  <li>Project structure consistency</li>
</ul>

<p>
Build status:
</p>

<p>
  <img src="https://github.com/transponster27/LLM-Resume-Analyzer/actions/workflows/ci.yml/badge.svg" />
</p>

<hr />

<h2>Business Impact</h2>

<p>
The system simulates automation of first-pass candidate screening
and demonstrates how semantic AI systems can reduce manual review time
by approximately 40%.
</p>

<hr />

<h2>Roadmap</h2>

<ul>
  <li>Batch resume ranking</li>
  <li>FAISS vector indexing integration</li>
  <li>Skill gap visualization</li>
  <li>Recruiter analytics dashboard</li>
  <li>FastAPI backend service</li>
  <li>Dockerized deployment</li>
</ul>

<hr />

<h2>Author</h2>

<p>
<strong>Vardah Rehman</strong><br />
MSc Artificial Intelligence & Machine Learning<br />
Focus: Applied LLM systems, semantic search, production ML engineering.
</p>

<hr />

<h2>Summary</h2>

<p>
This project demonstrates applied LLM integration,
semantic vector similarity,
modular AI system design,
and production-ready engineering practices.
</p>

<p>
It serves as both a portfolio showcase and a scalable foundation
for intelligent document understanding systems.
</p>
