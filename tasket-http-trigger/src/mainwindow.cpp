#include "mainwindow.h"
#include <QCoreApplication>
#include <functional>

std::shared_ptr<MainWindow> MainWindow::s_singleton = nullptr;

class MainWindowStubRegistry {
public:
    static std::function<void(const QString&, int, int)> s_autoRunCallback;
    static std::function<void()> s_forceQuitCallback;
};

std::function<void(const QString&, int, int)> MainWindowStubRegistry::s_autoRunCallback;
std::function<void()> MainWindowStubRegistry::s_forceQuitCallback;

std::shared_ptr<MainWindow> MainWindow::getInstance(QWidget *parent)
{
    if(s_singleton == nullptr)
    {
        s_singleton = std::shared_ptr<MainWindow>(new MainWindow(parent));
    }
    return s_singleton;
}

MainWindow::MainWindow(QWidget *parent)
    : QObject(parent)
{
}

void MainWindow::autoRun(const QString &filename, int delay, int loopTimes)
{
    if(MainWindowStubRegistry::s_autoRunCallback)
    {
        MainWindowStubRegistry::s_autoRunCallback(filename, delay, loopTimes);
    }
}

void MainWindow::forceQuit()
{
    if(MainWindowStubRegistry::s_forceQuitCallback)
    {
        MainWindowStubRegistry::s_forceQuitCallback();
    }
    else
    {
        QCoreApplication::quit();
    }
}

// C API for registration so main.cpp doesn't need to see internal classes
extern "C" void tasketHttpd_registerAutoRunCallback(void (*callback)(const char*, int, int))
{
    MainWindowStubRegistry::s_autoRunCallback = [callback](const QString &name, int delay, int loops) {
        if(callback)
            callback(name.toUtf8().constData(), delay, loops);
    };
}

extern "C" void tasketHttpd_registerForceQuitCallback(void (*callback)())
{
    MainWindowStubRegistry::s_forceQuitCallback = [callback]() {
        if(callback)
            callback();
    };
}
