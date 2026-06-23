#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QObject>
#include <QString>
#include <memory>

class MainWindow : public QObject
{
    Q_OBJECT

public:
    static std::shared_ptr<MainWindow> getInstance(QWidget *parent = nullptr);
    MainWindow(MainWindow &other) = delete;
    void operator=(const MainWindow &) = delete;
    ~MainWindow() = default;

    void autoRun(const QString &filename, int delay, int loopTimes = 1);
    void forceQuit();

private:
    explicit MainWindow(QWidget *parent = nullptr);
    static std::shared_ptr<MainWindow> s_singleton;
};

#endif // MAINWINDOW_H
