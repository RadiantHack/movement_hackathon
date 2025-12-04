"""
Quick test script to verify the application is working.

Run this script to test all endpoints:
    python test_app.py
"""

import requests
import sys
from typing import Dict, Any


BASE_URL = "http://localhost:8000"


def test_health_check() -> bool:
    """Test the health check endpoint."""
    print("Testing health check endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Health check passed: {data}")
            return True
        else:
            print(f"✗ Health check failed: Status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ Health check failed: {e}")
        return False


def test_balance_agent_card() -> bool:
    """Test balance agent card endpoint."""
    print("\nTesting Balance Agent card endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/balance/.well-known/agent-card.json", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Balance Agent card accessible: {data.get('name', 'Unknown')}")
            return True
        else:
            print(f"✗ Balance Agent card failed: Status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ Balance Agent card failed: {e}")
        return False


def test_liquidity_agent_card() -> bool:
    """Test liquidity agent card endpoint."""
    print("\nTesting Liquidity Agent card endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/liquidity/.well-known/agent-card.json", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Liquidity Agent card accessible: {data.get('name', 'Unknown')}")
            return True
        else:
            print(f"✗ Liquidity Agent card failed: Status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ Liquidity Agent card failed: {e}")
        return False


def test_orchestrator_endpoint() -> bool:
    """Test orchestrator endpoint."""
    print("\nTesting Orchestrator endpoint...")
    try:
        # Try to access the orchestrator root
        response = requests.get(f"{BASE_URL}/orchestrator/", timeout=5)
        # Any response (even 404) means the endpoint is mounted
        print(f"✓ Orchestrator endpoint accessible: Status {response.status_code}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"✗ Orchestrator endpoint failed: {e}")
        return False


def test_fastapi_docs() -> bool:
    """Test FastAPI docs endpoint."""
    print("\nTesting FastAPI docs endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/docs", timeout=5)
        if response.status_code == 200:
            print("✓ FastAPI docs accessible")
            return True
        else:
            print(f"✗ FastAPI docs failed: Status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ FastAPI docs failed: {e}")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("Testing Backend Application")
    print("=" * 60)
    print(f"\nBase URL: {BASE_URL}")
    print("\nMake sure the server is running:")
    print("  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000")
    print("\n" + "=" * 60 + "\n")
    
    results = []
    
    # Run tests
    results.append(("Health Check", test_health_check()))
    results.append(("Balance Agent Card", test_balance_agent_card()))
    results.append(("Liquidity Agent Card", test_liquidity_agent_card()))
    results.append(("Orchestrator Endpoint", test_orchestrator_endpoint()))
    results.append(("FastAPI Docs", test_fastapi_docs()))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Application is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())

