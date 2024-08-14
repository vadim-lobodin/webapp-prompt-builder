'use client'

import React, { useState, useEffect, useCallback } from 'react';
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

interface AIResponse {
    question: string;
    options: string[];
}

const ToggleButton: React.FC<{ label: string; isSelected: boolean; onClick: () => void }> = ({ label, isSelected, onClick }) => (
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

const TypingEffect: React.FC<{ text: string; onComplete: () => void }> = ({ text, onComplete }) => {
    const [displayText, setDisplayText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex < text.length) {
            const timer = setTimeout(() => {
                setDisplayText(prev => prev + text[currentIndex]);
                setCurrentIndex(prev => prev + 1);
            }, 30);
            return () => clearTimeout(timer);
        } else {
            onComplete();
        }
    }, [text, currentIndex, onComplete]);

    return (
        <span>
            {displayText}
            {currentIndex < text.length && <span className="animate-pulse">|</span>}
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
    const [currentQuestion, setCurrentQuestion] = useState<string>('');
    const [isTypingComplete, setIsTypingComplete] = useState(true);

    const addMessage = useCallback((content: string, isUser: boolean) => {
        setMessages(prev => [
            ...prev.map(msg => ({ ...msg, opacity: msg.opacity * 0.5 })),
            { content, isUser, id: Date.now(), opacity: 1 }
        ]);
        if (!isUser) {
            setIsTypingComplete(false);
            setShowChoices(false);
        }
    }, []);

    const handleTypingComplete = useCallback(() => {
        setIsTypingComplete(true);
        setShowChoices(true);
    }, []);

    const handleApiCall = useCallback(async (messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<AIResponse> => {
        try {
            console.log('Sending API request with messages:', messages);

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages,
            });

            console.log('Received raw API response:', response);

            const content = response.choices[0].message.content;
            if (!content) {
                throw new Error("No content in AI response");
            }

            console.log('Raw content from AI:', content);

            // Remove any markdown formatting
            const cleanedContent = content.replace(/^```json\n|\n```$/g, '').trim();

            console.log('Cleaned content:', cleanedContent);

            const parsedResponse = JSON.parse(cleanedContent) as AIResponse;

            console.log('Parsed response:', parsedResponse);

            if (!parsedResponse.question && !Array.isArray(parsedResponse.options)) {
                throw new Error("Invalid response structure from AI");
            }

            return parsedResponse;
        } catch (error) {
            console.error('Detailed error in API call:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to process AI response: ${error.message}`);
            } else {
                throw new Error("Failed to process AI response: Unknown error");
            }
        }
    }, []);

    const handleSendMessage = useCallback(async () => {
        if (!input.trim()) return;

        addMessage(input, true);
        setInput('');
        setStage('in_progress');
        setReadyPercentage(20);
        setIsLoading(true);

        try {
            const aiResponse = await handleApiCall([
                { role: "system", content: "You are an AI assistant helping to create an app concept. Ask a single, clear follow-up question about the app idea. Then, provide 5 possible answers as options, but do not include these in your question. Important: Format your response as JSON with 'question' and 'options' fields." },
                { role: "user", content: input }
            ]);

            addMessage(aiResponse.question, false);
            setCurrentQuestion(aiResponse.question);
            setChoices(aiResponse.options.map((option) => ({
                label: option,
                isSelected: false
            })));
        } catch (error) {
            console.error('Error in handleSendMessage:', error);
            addMessage("I'm sorry, I encountered an error processing the response. Please try again.", false);
        } finally {
            setIsLoading(false);
        }
    }, [input, addMessage, handleApiCall, setCurrentQuestion, setChoices]);

    const handleChoiceToggle = useCallback((label: string) => {
        setSelectedChoices(prev =>
            prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]
        );
        setChoices(prev => prev.map(choice =>
            choice.label === label ? {...choice, isSelected: !choice.isSelected} : choice
        ));
    }, []);

    const handleNextStep = useCallback(async () => {
        if (selectedChoices.length === 0) return;

        addMessage(`You: ${selectedChoices.join(', ')}`, true);
        setSelectedChoices([]);
        setChoices([]);

        setReadyPercentage(prev => Math.min(100, prev + 20));

        if (readyPercentage < 80) {
            setIsLoading(true);
            try {
                const aiResponse = await handleApiCall([
                    {
                        role: "system",
                        content: "You are an AI assistant helping to create an app concept. Based on the previous conversation, ask a single, clear follow-up question about another aspect of the app. Then, provide 5 possible answers as options, but do not include these in your question. Format your response as JSON with 'question' and 'options' fields."
                    },
                    ...messages.map(msg => ({
                        role: msg.isUser ? "user" : "assistant",
                        content: msg.content
                    })) as OpenAI.Chat.ChatCompletionMessageParam[],
                    { role: "user", content: selectedChoices.join(', ') }
                ]);

                addMessage(aiResponse.question, false);
                setCurrentQuestion(aiResponse.question);
                setChoices(aiResponse.options.map((option) => ({
                    label: option,
                    isSelected: false
                })));
            } catch (error) {
                console.error('Error in handleNextStep:', error);
                addMessage("I'm sorry, I encountered an error generating the next question. Please try again.", false);
            } finally {
                setIsLoading(false);
            }
        } else {
            setStage('completed');
            setIsLoading(true);
        }
    }, [selectedChoices, readyPercentage, messages, addMessage, handleApiCall, setCurrentQuestion, setChoices]);

    const handleMoreChoices = useCallback(async () => {
        setIsLoading(true);
        try {
            console.log('Sending request for more choices...');
            console.log('Current question:', currentQuestion);
            console.log('Existing choices:', choices.map(c => c.label));

            const aiResponse = await handleApiCall([
                {
                    role: "system",
                    content: "You are an AI assistant helping to create an app concept. Based on the given question and existing choices, provide 5 additional, diverse, and relevant options. These should be different from the existing choices but still closely related to the question. Format your response as JSON with an 'options' field containing an array of 5 strings."
                },
                { role: "user", content: `Current question: "${currentQuestion}"\n\nExisting choices: ${choices.map(c => c.label).join(', ')}\n\nGenerate 5 more relevant and diverse options related to this question, different from the existing choices.` }
            ]);

            console.log('Received AI response:', aiResponse);

            if (!Array.isArray(aiResponse.options) || aiResponse.options.length === 0) {
                throw new Error('AI response does not contain valid options');
            }

            setChoices(prev => [
                ...prev,
                ...aiResponse.options.map((option) => ({
                    label: option,
                    isSelected: false
                }))
            ]);

            console.log('New choices added successfully');
        } catch (error) {
            console.error('Detailed error in handleMoreChoices:', error);
            if (error instanceof Error) {
                addMessage(`I'm sorry, I encountered an error while fetching more options: ${error.message}. Please try again.`, false);
            } else {
                addMessage("I'm sorry, I encountered an unexpected error while fetching more options. Please try again.", false);
            }
        } finally {
            setIsLoading(false);
        }
    }, [currentQuestion, choices, handleApiCall, addMessage]);

    useEffect(() => {
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
                                showChoices && isTypingComplete && choices.length > 0 ? 'opacity-100 max-h-[1000px]' : 'opacity-0 max-h-0 overflow-hidden'
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
                            <Button
                                onClick={handleMoreChoices}
                                className="h-14 px-5 py-3 rounded-full border text-[19px] font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Loading...' : 'More'}
                            </Button>
                        </div>

                        <div className="flex justify-end items-center space-x-4 pt-2">
                            <p className="text-gray-500 text-[17px]">
                                {readyPercentage}% ready
                            </p>
                            <Button
                                onClick={handleNextStep}
                                className="rounded-full w-14 h-14 p-0 flex items-center justify-center bg-black hover:bg-gray-800"
                                disabled={isLoading || !isTypingComplete}
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