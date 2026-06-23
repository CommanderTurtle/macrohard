#include "TaskRunner.h"
#include "TaskJsonLoader.h"
#include <QFile>

TaskRunner::TaskRunner(TaskRegistry *registry, QObject *parent)
    : QObject(parent), m_registry(registry)
{
}

TaskRunner::~TaskRunner()
{
    stopAllTasks();
}

void TaskRunner::executeTask(int taskNumber, QString taskPath, int loopTimes)
{
    if(!m_registry)
        return;

    if(!QFile::exists(taskPath))
    {
        m_registry->markFailed(taskNumber, QString("Task file not found: %1").arg(taskPath));
        return;
    }

    TaskJsonLoader loader;
    auto task = loader.loadTaskFromFile(taskPath);
    if(!task)
    {
        m_registry->markFailed(taskNumber, loader.lastError());
        return;
    }

    if(task->m_actionsOrderedList.isEmpty())
    {
        m_registry->markFailed(taskNumber, "Task contains no actions");
        return;
    }

    TaskThread *thread = new TaskThread();
    thread->copyActionsList(task);

    if(loopTimes < 0)
    {
        thread->m_loop = true;
        thread->m_timesToRun = 1;
    }
    else
    {
        thread->m_loop = false;
        thread->m_timesToRun = static_cast<unsigned int>(loopTimes);
    }

    connect(thread, &TaskThread::sendFinishedAllLoops, this, &TaskRunner::onTaskThreadFinished);
    connect(thread, &TaskThread::finished, thread, &TaskThread::deleteLater);

    m_threads.insert(taskNumber, thread);
    m_registry->markStarted(taskNumber);

    thread->start();

    auto optTask = m_registry->getTask(taskNumber);
    if(optTask)
        emit taskExecutionStarted(taskNumber, optTask->taskName);
}

void TaskRunner::stopAllTasks()
{
    for(auto it = m_threads.begin(); it != m_threads.end(); ++it)
    {
        TaskThread *thread = it.value();
        if(thread)
        {
            thread->stop();
        }
        if(m_registry)
            m_registry->markStopped(it.key());
    }
    m_threads.clear();
}

void TaskRunner::stopTaskThread(int taskNumber)
{
    auto it = m_threads.find(taskNumber);
    if(it != m_threads.end())
    {
        TaskThread *thread = it.value();
        if(thread)
            thread->stop();
        m_threads.erase(it);
        if(m_registry)
            m_registry->markStopped(taskNumber);
    }
}

void TaskRunner::onTaskThreadFinished()
{
    TaskThread *thread = qobject_cast<TaskThread*>(sender());
    if(!thread)
        return;

    // Find which task number owns this thread
    int taskNumber = -1;
    for(auto it = m_threads.begin(); it != m_threads.end(); ++it)
    {
        if(it.value() == thread)
        {
            taskNumber = it.key();
            break;
        }
    }

    if(taskNumber < 0)
        return; // Already removed by stopTaskThread() — don't double-transition

    m_threads.remove(taskNumber);

    // Only mark finished if the task wasn't already stopped externally
    auto optTask = m_registry->getTask(taskNumber);
    if(optTask && optTask->state != TaskState::Stopped)
    {
        m_registry->markFinished(taskNumber);
        emit taskExecutionFinished(taskNumber, optTask->taskName);
    }
}
