#ifndef TASKRUNNER_H
#define TASKRUNNER_H

#include "Types.h"
#include "TaskRegistry.h"
#include "TaskThread.h"

#include <QObject>
#include <QMap>
#include <memory>

/**
 * @brief Bridges the HTTP trigger to the Tasket++ automation engine.
 *
 * TaskRunner receives execute requests from TaskRegistry, loads the .scht
 * file via TaskJsonLoader, copies actions into a TaskThread, and starts it.
 * It tracks running TaskThreads so they can be stopped on demand.
 */
class TaskRunner : public QObject
{
    Q_OBJECT

public:
    explicit TaskRunner(TaskRegistry *registry, QObject *parent = nullptr);
    ~TaskRunner();

public slots:
    /**
     * @brief Actually execute a task (called when delay timer expires).
     */
    void executeTask(int taskNumber, QString taskPath, int loopTimes);

    /**
     * @brief Stop all running threads.
     */
    void stopAllTasks();

    /**
     * @brief Stop a specific task thread.
     */
    void stopTaskThread(int taskNumber);

signals:
    void taskExecutionStarted(int taskNumber, QString taskName);
    void taskExecutionFinished(int taskNumber, QString taskName);

private slots:
    void onTaskThreadFinished();

private:
    TaskRegistry *m_registry = nullptr;
    // Maps taskNumber -> TaskThread*
    QMap<int, TaskThread*> m_threads;
};

#endif // TASKRUNNER_H
