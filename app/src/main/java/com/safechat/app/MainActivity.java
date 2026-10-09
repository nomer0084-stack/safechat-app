package com.safechat.app;

import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class MainActivity extends AppCompatActivity {
    private WebSocket webSocket;
    private TextView messagesView;
    private EditText inputView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        messagesView = findViewById(R.id.messagesView);
        inputView = findViewById(R.id.inputView);
        Button sendButton = findViewById(R.id.sendButton);

        startWebSocket();

        sendButton.setOnClickListener(v -> {
            String text = inputView.getText().toString().trim();
            if (!text.isEmpty() && webSocket != null) {
                webSocket.send("{\"type\":\"msg\",\"chatId\":\"general\",\"ciphertext\":\"" + text + "\",\"time\":\"now\"}");
                messagesView.append("\nВы: " + text);
                inputView.setText("");
            }
        });
    }

    private void startWebSocket() {
        OkHttpClient client = new OkHttpClient();
        Request request = new Request.Builder().url("ws://2.56.118.10").build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                runOnUiThread(() -> messagesView.append("Подключено к серверу SafeChat\n"));
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                runOnUiThread(() -> messagesView.append("\nСообщение: " + text));
            }
        });
    }
}
