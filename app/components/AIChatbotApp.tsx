'use client'

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

interface Message {
    content: string;
    isUser: boolean;
    id: number;
    opacity: number;
}

interface Choice {
    label: string;
    isSelected: boolean;
}

const ToggleButton: React.FC<{ label: string; isSelected: boolean; onClick: () => void }> = ({ label, isSelected, onClick }) => {
    return (
        <Button
            onClick={onClick}
            className={`h-14 px-5 py-3 rounded-full border text-[19px] font-medium flex items-center space-x-2 transition-colors ${
                isSelected
                    ? 'bg-black text-white border-black'
                    : 'bg-white border-gray-300 hover:bg-gray-100'
            }`}
        >
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                isSelected ? 'border-white' : 'border-gray-400'
            }`}>
                {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                )}
            </div>
            <span className={isSelected ? 'text-white' : 'text-gray-900'}>{label}</span>
        </Button>
    );
};

const TypingEffect: React.FC<{ text: string; onComplete: () => void }> = ({ text, onComplete }) => {
    const [displayText, setDisplayText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTypingComplete, setIsTypingComplete] = useState(false);

    useEffect(() => {
        if (currentIndex < text.length) {
            const timer = setTimeout(() => {
                setDisplayText((prevText) => prevText + text[currentIndex]);
                setCurrentIndex((prevIndex) => prevIndex + 1);
            }, 30);

            return () => clearTimeout(timer);
        } else if (currentIndex === text.length && !isTypingComplete) {
            setIsTypingComplete(true);
            onComplete();
        }
    }, [text, currentIndex, onComplete, isTypingComplete]);

    return (
        <span>
      {displayText}
            {!isTypingComplete && <span className="animate-pulse">|</span>}
    </span>
    );
};

const AIChatbotApp: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [choices, setChoices] = useState<Choice[]>([]);
    const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
    const [readyPercentage, setReadyPercentage] = useState(0);
    const [stage, setStage] = useState('initial');
    const [isLoading, setIsLoading] = useState(false);
    const [showChoices, setShowChoices] = useState(false);

    const addMessage = (content: string, isUser: boolean) => {
        setMessages(prev => [
            ...prev.map(msg => ({ ...msg, opacity: msg.opacity * 0.5 })),
            { content, isUser, id: Date.now(), opacity: 1 }
        ]);
        setShowChoices(false);
    };

    const handleTypingComplete = () => {
        setShowChoices(true);
    };

    const handleSendMessage = async () => {
        if (!input.trim()) return;

        addMessage(input, true);
        setInput('');
        setStage('in_progress');
        setReadyPercentage(20);

        setIsLoading(true);
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {role: "system", content: "You are an AI assistant helping to create an app concept. Ask a single, clear follow-up question about the app idea. Then, provide 5 possible answers as options, but do not include these in your question. Format your response as JSON with 'question' and 'options' fields."},
                    {role: "user", content: input}
                ],
            });

            const content = response.choices[0].message.content;
            if (content) {
                try {
                    const aiResponse = JSON.parse(content) as { question: string; options: string[] };
                    if (aiResponse.question && Array.isArray(aiResponse.options)) {
                        addMessage(aiResponse.question, false);
                        setChoices(aiResponse.options.map(option => ({
                            label: option,
                            isSelected: false
                        })));
                    } else {
                        throw new Error("Invalid response format");
                    }
                } catch (parseError) {
                    console.error('Error parsing AI response:', parseError);
                    addMessage("I'm sorry, I received an invalid response. Please try again.", false);
                }
            } else {
                throw new Error("No content in AI response");
            }
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            addMessage("I'm sorry, I encountered an error. Please try again.", false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleChoiceToggle = (label: string) => {
        setSelectedChoices(prev => {
            const newChoices = prev.includes(label)
                ? prev.filter(c => c !== label)
                : [...prev, label];
            return newChoices;
        });
        setChoices(prev => prev.map(choice =>
            choice.label === label ? {...choice, isSelected: !choice.isSelected} : choice
        ));
    };

    const handleNextStep = async () => {
        if (selectedChoices.length === 0) return;

        addMessage(`You: ${selectedChoices.join(', ')}`, true);
        setSelectedChoices([]);
        setChoices([]);

        setReadyPercentage(prev => Math.min(100, prev + 20));

        if (readyPercentage < 80) {
            setIsLoading(true);
            try {
                const [response] = await Promise.all([openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: "You are an AI assistant helping to create an app concept..."
                        },
                        ...messages.map(msg => ({
                            role: msg.isUser ? "user" : "assistant" as "user" | "assistant",
                            content: msg.content
                        })),
                        { role: "user", content: selectedChoices.join(', ') }
                    ],
                })]);

                const content = response.choices[0].message.content;
                if (content) {
                    try {
                        const aiResponse = JSON.parse(content) as { question: string; options: string[] };
                        if (aiResponse.question && Array.isArray(aiResponse.options)) {
                            addMessage(aiResponse.question, false);
                            setChoices(aiResponse.options.map(option => ({
                                label: option,
                                isSelected: false
                            })));
                        } else {
                            throw new Error("Invalid response format");
                        }
                    } catch (parseError) {
                        console.error('Error parsing AI response:', parseError);
                        addMessage("I'm sorry, I received an invalid response. Please try again.", false);
                    }
                } else {
                    throw new Error("No content in AI response");
                }
            } catch (error) {
                console.error('Error calling OpenAI API:', error);
                addMessage("I'm sorry, I encountered an error. Please try again.", false);
            } finally {
                setIsLoading(false);
            }
        } else {
            setStage('completed');
            setTimeout(() => {
                setIsLoading(true);
            }, 1000);
        }
    };

    useEffect(() => {
        // Scroll to bottom when messages change
        window.scrollTo(0, document.body.scrollHeight);
    }, [messages, showChoices]);

    if (isLoading && stage === 'completed') {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-100">
                <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xl font-semibold text-gray-700">Your app is being built</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex justify-center items-center min-h-screen w-full bg-gray-100 p-4">
            <div className="w-full max-w-[800px] space-y-7">
                {stage === 'initial' ? (
                    <div className="flex gap-3">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="What kind of app would you like to create?"
                            className="flex-grow h-14 text-lg"
                        />
                        <Button
                            onClick={handleSendMessage}
                            className="rounded-full w-14 h-14 p-0 flex items-center justify-center bg-black hover:bg-gray-800"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <div className="w-6 h-6 border-t-2 border-white rounded-full animate-spin"></div>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-7 h-7 text-white">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            )}
                        </Button>
                    </div>
                ) : (
                    <>
                        {messages.map((message) => (
                            <p
                                key={message.id}
                                style={{ opacity: message.opacity }}
                                className={`text-[17px] leading-[26px] transition-opacity duration-300 ${
                                    message.isUser ? 'text-gray-700' : 'font-semibold text-gray-900'
                                }`}
                            >
                                {message.isUser ? message.content : (
                                    <TypingEffect text={message.content} onComplete={handleTypingComplete} />
                                )}
                            </p>
                        ))}

                        <div
                            className={`flex flex-wrap gap-3 transition-all duration-500 ease-in-out ${
                                showChoices && choices.length > 0 ? 'opacity-100 max-h-[1000px]' : 'opacity-0 max-h-0 overflow-hidden'
                            }`}
                        >
                            {choices.map((choice, index) => (
                                <ToggleButton
                                    key={index}
                                    label={choice.label}
                                    isSelected={choice.isSelected}
                                    onClick={() => handleChoiceToggle(choice.label)}
                                />
                            ))}
                        </div>

                        <div className="flex justify-end items-center space-x-4 pt-2">
                            <p className="text-gray-500 text-[17px]">
                                {readyPercentage}% ready
                            </p>
                            <Button
                                onClick={handleNextStep}
                                className="rounded-full w-14 h-14 p-0 flex items-center justify-center bg-black hover:bg-gray-800"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <div className="w-6 h-6 border-t-2 border-white rounded-full animate-spin"></div>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-7 h-7 text-white">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AIChatbotApp;