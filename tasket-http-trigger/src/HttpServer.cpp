#include "HttpServer.h"
#include "TaskRegistry.h"
#include "globals.h"

#define CPPHTTPLIB_OPENSSL_SUPPORT 0
#include "httplib.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDir>
#include <QFileInfo>
#include <QFile>
#include <QMetaObject>
#include <QCoreApplication>

HttpServer::HttpServer(TaskRegistry *registry, QObject *parent)
    : QObject(parent), m_registry(registry)
{
}

HttpServer::~HttpServer()
{
    stop();
}

bool HttpServer::start(const QString &host, int port, const QString &tasksDir,
                       const QString &apiKey)
{
    if(m_running)
        return false;

    m_host = host;
    m_port = port;
    m_tasksDir = tasksDir;
    m_apiKey = apiKey;

    if(!QDir(m_tasksDir).exists())
        QDir().mkpath(m_tasksDir);

    m_serverThread = new QThread(this);

    connect(m_serverThread, &QThread::started, this, [this]() {
        m_server = new httplib::Server();
        setupRoutes();
        qInfo().nospace() << "[HTTP] Server starting on " << m_host << ":" << m_port;
        if(!m_server->listen(m_host.toStdString().c_str(), m_port))
        {
            qCritical().nospace() << "[HTTP] Failed to bind to " << m_host << ":" << m_port;
            m_running = false;
        }
        delete m_server;
        m_server = nullptr;
    });

    m_running = true;
    m_serverThread->start();

    QThread::msleep(200);
    return m_running;
}

void HttpServer::stop()
{
    if(!m_running)
        return;
    m_running = false;

    // Stop the server first to unblock listen(), then stop the thread
    if(m_server)
        m_server->stop();

    if(m_serverThread)
    {
        m_serverThread->quit();
        m_serverThread->wait(3000);
        if(m_serverThread->isRunning())
            m_serverThread->terminate();
        delete m_serverThread;
        m_serverThread = nullptr;
    }
    qInfo() << "[HTTP] Server stopped.";
}

bool HttpServer::isRunning() const { return m_running; }

QString HttpServer::listenAddress() const
{
    return QString("http://%1:%2").arg(m_host).arg(m_port);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

bool HttpServer::checkAuth(const httplib::Request &req, httplib::Response &res) const
{
    if(m_apiKey.isEmpty())
        return true;

    auto it = req.headers.find("X-Tasket-Key");
    if(it == req.headers.end())
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::Unauthorized,
            "Missing X-Tasket-Key header"));
        return false;
    }
    if(QString::fromStdString(it->second) != m_apiKey)
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::Forbidden,
            "Invalid API key"));
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

void HttpServer::sendResponse(httplib::Response &res, const ApiResponse &api)
{
    res.status = static_cast<int>(api.status);
    res.set_content(api.toJsonBytes().toStdString(), "application/json");
}

// ---------------------------------------------------------------------------
// Route setup
// ---------------------------------------------------------------------------

void HttpServer::setupRoutes()
{
    if(!m_server) return;

    m_server->Get("/",       [this](auto &req, auto &res){ handleRoot(req, res); });
    m_server->Get("/health", [this](auto &req, auto &res){ handleHealth(req, res); });
    m_server->Get("/tasks",  [this](auto &req, auto &res){ handleListTasks(req, res); });
    m_server->Get("/run",    [this](auto &req, auto &res){ handleRunGet(req, res); });
    m_server->Post("/run",   [this](auto &req, auto &res){ handleRunPost(req, res); });
    m_server->Get("/check",  [this](auto &req, auto &res){ handleCheck(req, res); });
    m_server->Get("/status", [this](auto &req, auto &res){ handleStatus(req, res); });
    m_server->Post("/stop",  [this](auto &req, auto &res){ handleStop(req, res); });

    m_server->set_error_handler([](const httplib::Request &req, httplib::Response &res) {
        QJsonObject err;
        err["success"] = false;
        err["message"] = "Not Found";
        err["path"] = QString::fromStdString(req.path);
        res.status = 404;
        res.set_content(QJsonDocument(err).toJson().toStdString(), "application/json");
    });
}

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

void HttpServer::handleRoot(const httplib::Request &req, httplib::Response &res)
{
    if(!checkAuth(req, res)) return;

    QJsonObject info;
    info["name"] = "Tasket++ HTTP Trigger";
    info["version"] = APP_VERSION;
    info["daemon"] = "tasket-httpd";
    info["listen_address"] = listenAddress();
    info["tasks_directory"] = m_tasksDir;
    info["auth_enabled"] = !m_apiKey.isEmpty();
    info["default_delay_seconds"] = m_defaultDelay;

    QJsonArray tools;
    for(const auto &td : buildToolInventory())
        tools.append(td.toJson());
    info["tools"] = tools;

    QJsonArray endpoints;
    endpoints << "/" << "/health" << "/tasks" << "/run?task=<name>&delay=<sec>"
              << "POST /run" << "/check?id=<number>" << "/status" << "POST /stop?id=<number>";
    info["endpoints"] = endpoints;

    ApiResponse api;
    api.success = true;
    api.message = "Tasket++ HTTP Trigger Daemon";
    api.data = info;
    sendResponse(res, api);
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

void HttpServer::handleHealth(const httplib::Request &req, httplib::Response &res)
{
    if(!checkAuth(req, res)) return;

    QJsonObject j;
    j["status"] = m_running ? "ok" : "down";
    j["address"] = listenAddress();
    j["tasks_dir"] = m_tasksDir;
    j["task_count"] = scanTaskNames().size();

    ApiResponse api = ApiResponse::ok("Healthy");
    api.data = j;
    sendResponse(res, api);
}

// ---------------------------------------------------------------------------
// GET /tasks
// ---------------------------------------------------------------------------

void HttpServer::handleListTasks(const httplib::Request &req, httplib::Response &res)
{
    if(!checkAuth(req, res)) return;

    QStringList names = scanTaskNames();
    QJsonArray arr;
    for(const QString &n : names)
    {
        QString path = resolveTaskPath(n);
        QJsonObject taskObj;
        taskObj["name"] = n;
        taskObj["delay_seconds"] = readTaskDelay(path, m_defaultDelay);
        taskObj["description"] = readTaskDescription(path);
        arr.append(taskObj);
    }

    QJsonObject j;
    j["tasks"] = arr;
    j["count"] = arr.size();

    ApiResponse api = ApiResponse::ok(QString("Found %1 task(s)").arg(arr.size()));
    api.data = j;
    sendResponse(res, api);
}

// ---------------------------------------------------------------------------
// GET /run?task=<name>&delay=<sec>&loop=<n>
// ---------------------------------------------------------------------------

void HttpServer::handleRunGet(const httplib::Request &req, httplib::Response &res)
{
    if(!checkAuth(req, res)) return;

    QString taskName = QString::fromStdString(req.get_param_value("task"));
    if(taskName.isEmpty())
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::BadRequest,
            "Missing 'task' query parameter. Example: /run?task=HelloWorld&delay=10"));
        return;
    }

    QString taskPath = resolveTaskPath(taskName);
    if(taskPath.isEmpty() || !QFile::exists(taskPath))
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::NotFound,
            QString("Task '%1' not found in %2").arg(taskName).arg(m_tasksDir)));
        return;
    }

    // Parse delay: query param > task file default > global default (10)
    int delay = m_defaultDelay;
    QString delayParam = QString::fromStdString(req.get_param_value("delay"));
    if(!delayParam.isEmpty())
        delay = delayParam.toInt();
    else
        delay = readTaskDelay(taskPath, m_defaultDelay);

    int loopTimes = 1;
    QString loopParam = QString::fromStdString(req.get_param_value("loop"));
    if(!loopParam.isEmpty())
    {
        if(loopParam.toLower() == "inf" || loopParam.toLower() == "infinite")
            loopTimes = -1;
        else
            loopTimes = loopParam.toInt();
    }

    QString description = readTaskDescription(taskPath);

    TaskInstance ti = m_registry->scheduleTask(taskName, taskPath, delay, loopTimes, description);
    emit requestReceived("GET", "/run", QString("%1 (#%2, delay=%3s)").arg(taskName).arg(ti.taskNumber).arg(delay));

    sendResponse(res, ApiResponse::taskScheduled(ti));
}

// ---------------------------------------------------------------------------
// POST /run {task: <name>, delay: <sec>, loop: <n>}
// ---------------------------------------------------------------------------

void HttpServer::handleRunPost(const httplib::Request &req, httplib::Response &res)
{
    if(!checkAuth(req, res)) return;

    QString body = QString::fromStdString(req.body);
    QJsonDocument docIn = QJsonDocument::fromJson(body.toUtf8());
    if(docIn.isNull() || !docIn.object().contains("task"))
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::BadRequest,
            "Invalid JSON body: missing 'task' field. Example: { \"task\": \"HelloWorld\", \"delay\": 10 }"));
        return;
    }

    QJsonObject jsonBody = docIn.object();
    QString taskName = jsonBody.value("task").toString();
    if(taskName.isEmpty())
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::BadRequest, "'task' field cannot be empty"));
        return;
    }

    QString taskPath = resolveTaskPath(taskName);
    if(taskPath.isEmpty() || !QFile::exists(taskPath))
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::NotFound,
            QString("Task '%1' not found").arg(taskName)));
        return;
    }

    int delay = m_defaultDelay;
    if(jsonBody.contains("delay"))
        delay = jsonBody.value("delay").toInt(delay);
    else
        delay = readTaskDelay(taskPath, m_defaultDelay);

    int loopTimes = 1;
    QJsonValue loopVal = jsonBody.value("loop");
    if(loopVal.isString() && loopVal.toString().toLower() == "infinite")
        loopTimes = -1;
    else
        loopTimes = loopVal.toInt(1);

    QString description = readTaskDescription(taskPath);

    TaskInstance ti = m_registry->scheduleTask(taskName, taskPath, delay, loopTimes, description);
    emit requestReceived("POST", "/run", QString("%1 (#%2, delay=%3s)").arg(taskName).arg(ti.taskNumber).arg(delay));

    sendResponse(res, ApiResponse::taskScheduled(ti));
}

// ---------------------------------------------------------------------------
// GET /check?id=<number>
// ---------------------------------------------------------------------------

void HttpServer::handleCheck(const httplib::Request &req, httplib::Response &res)
{
    if(!checkAuth(req, res)) return;

    QString idParam = QString::fromStdString(req.get_param_value("id"));
    if(idParam.isEmpty())
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::BadRequest,
            "Missing 'id' query parameter. Example: /check?id=1"));
        return;
    }

    int taskNumber = idParam.toInt();
    auto optTask = m_registry->getTask(taskNumber);
    if(!optTask)
    {
        sendResponse(res, ApiResponse::error(HttpStatusCode::NotFound,
            QString("Task #%1 not found").arg(taskNumber)));
        return;
    }

    emit requestReceived("GET", "/check", QString("task #%1").arg(taskNumber));
    sendResponse(res, ApiResponse::taskCheck(*optTask));
}

// ---------------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------------

void HttpServer::handleStatus(const httplib::Request &req, httplib::Response &res)
{
    if(!checkAuth(req, res)) return;

    auto all = m_registry->allTasks();
    QJsonArray scheduled, running, finished;

    for(const auto &ti : all)
    {
        switch(ti.state)
        {
            case TaskState::Scheduled: scheduled.append(ti.toJson()); break;
            case TaskState::Running:   running.append(ti.toJson());   break;
            case TaskState::Finished:
            case TaskState::Stopped:
            case TaskState::Failed:    finished.append(ti.toJson());  break;
            default: break;
        }
    }

    QJsonObject j;
    j["scheduled"] = scheduled;
    j["running"] = running;
    j["finished"] = finished;
    j["scheduled_count"] = scheduled.size();
    j["running_count"] = running.size();
    j["finished_count"] = finished.size();
    j["total_count"] = all.size();

    ApiResponse api = ApiResponse::ok("Daemon status");
    api.data = j;
    sendResponse(res, api);
}

// ---------------------------------------------------------------------------
// POST /stop?id=<number>
// ---------------------------------------------------------------------------

void HttpServer::handleStop(const httplib::Request &req, httplib::Response &res)
{
    if(!checkAuth(req, res)) return;

    QString idParam = QString::fromStdString(req.get_param_value("id"));

    if(idParam.isEmpty())
    {
        // Stop all
        m_registry->stopAll();
        emit requestReceived("POST", "/stop", "all");
        sendResponse(res, ApiResponse::ok("All active tasks stopped"));
    }
    else
    {
        int taskNumber = idParam.toInt();
        auto optTask = m_registry->getTask(taskNumber);
        if(!optTask)
        {
            sendResponse(res, ApiResponse::error(HttpStatusCode::NotFound,
                QString("Task #%1 not found").arg(taskNumber)));
            return;
        }

        m_registry->stopTask(taskNumber);
        emit requestReceived("POST", "/stop", QString("task #%1").arg(taskNumber));
        sendResponse(res, ApiResponse::ok(QString("Task #%1 '%2' stopped")
            .arg(taskNumber).arg(optTask->taskName)));
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

QStringList HttpServer::scanTaskNames() const
{
    QStringList names;
    QDir dir(m_tasksDir);
    if(!dir.exists()) return names;

    QFileInfoList files = dir.entryInfoList(QStringList() << "*.scht", QDir::Files);
    for(const QFileInfo &fi : files)
        names.append(fi.baseName());
    return names;
}

QString HttpServer::resolveTaskPath(const QString &taskName) const
{
    QString cleanName = taskName;
    if(cleanName.endsWith(G_Files::TasksFileExtension, Qt::CaseInsensitive))
        cleanName.chop(G_Files::TasksFileExtension.length());

    QDir dir(m_tasksDir);
    QString fullName = cleanName + G_Files::TasksFileExtension;
    QFileInfo fi(dir.absoluteFilePath(fullName));
    if(fi.exists()) return fi.absoluteFilePath();

    // Case-insensitive fallback
    QFileInfoList files = dir.entryInfoList(QStringList() << "*.scht", QDir::Files);
    for(const QFileInfo &f : files)
    {
        if(f.baseName().compare(cleanName, Qt::CaseInsensitive) == 0)
            return f.absoluteFilePath();
    }
    return QString();
}

int HttpServer::readTaskDelay(const QString &taskPath, int defaultDelay) const
{
    QFile file(taskPath);
    if(!file.open(QIODevice::ReadOnly | QIODevice::Text))
        return defaultDelay;

    QByteArray data = file.readAll();
    file.close();

    QJsonDocument doc = QJsonDocument::fromJson(data);
    if(doc.isNull()) return defaultDelay;

    QJsonObject obj = doc.object();
    // Support both "delay" and "http_delay" keys in the .scht file
    if(obj.contains("http_delay"))
        return obj.value("http_delay").toInt(defaultDelay);
    if(obj.contains("delay"))
    {
        QJsonValue v = obj.value("delay");
        if(v.isDouble()) return v.toInt();
    }
    return defaultDelay;
}

QString HttpServer::readTaskDescription(const QString &taskPath) const
{
    QFile file(taskPath);
    if(!file.open(QIODevice::ReadOnly | QIODevice::Text))
        return QString();

    QByteArray data = file.readAll();
    file.close();

    QJsonDocument doc = QJsonDocument::fromJson(data);
    if(doc.isNull()) return QString();

    return doc.object().value(G_Files::DocumentTaskDescription_KeyWord).toString();
}

QList<ToolDescriptor> HttpServer::buildToolInventory() const
{
    QList<ToolDescriptor> tools;

    tools.append({"Run Task (GET)",
        "Schedule a saved .scht macro to run after its configured delay.",
        "/run?task=<name>&delay=<sec>&loop=<n>", "GET",
        "/run?task=HelloWorld&delay=10&loop=1"});

    tools.append({"Run Task (POST)",
        "Schedule a macro via JSON body for richer parameter control.",
        "/run", "POST",
        "{ \"task\": \"HelloWorld\", \"delay\": 10, \"loop\": 1 }"});

    tools.append({"Check Task",
        "Query a specific task by its assigned number to see state and remaining time.",
        "/check?id=<number>", "GET",
        "/check?id=1"});

    tools.append({"List Tasks",
        "Browse all available .scht macros in the tasks directory with their default delays.",
        "/tasks", "GET",
        "/tasks"});

    tools.append({"Daemon Status",
        "Full breakdown of scheduled, running, and finished tasks.",
        "/status", "GET",
        "/status"});

    tools.append({"Stop Task",
        "Stop a specific running or scheduled task by number.",
        "/stop?id=<number>", "POST",
        "/stop?id=1"});

    tools.append({"Stop All",
        "Immediately stop every active task and clear scheduled timers.",
        "/stop", "POST",
        "/stop"});

    tools.append({"Health Check",
        "Lightweight ping to verify the daemon is alive.",
        "/health", "GET",
        "/health"});

    return tools;
}
